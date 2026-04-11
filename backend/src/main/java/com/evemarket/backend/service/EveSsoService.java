package com.evemarket.backend.service;

import com.evemarket.backend.config.EveSsoConfig;
import com.evemarket.backend.dto.MyOrderDto;
import com.evemarket.backend.dto.TransactionDto;
import com.evemarket.backend.dto.WalletDto;
import com.evemarket.backend.repository.ItemTypeRepository;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EveSsoService {

    private static final String SSO_TOKEN_URL  = "https://login.eveonline.com/v2/oauth/token";
    private static final String SSO_AUTH_URL   = "https://login.eveonline.com/v2/oauth/authorize";
    private static final String SSO_SCOPE      = "esi-markets.read_character_orders.v1 esi-markets.read_corporation_orders.v1 esi-wallet.read_character_wallet.v1 esi-wallet.read_corporation_wallets.v1";
    private static final String ESI_BASE       = "https://esi.evetech.net/latest";

    private static final Map<Integer, String> REGION_NAMES = Map.of(
            10000002, "The Forge",
            10000043, "Domain",
            10000032, "Sinq Laison",
            10000030, "Heimatar",
            10000042, "Metropolis"
    );

    private final WebClient          webClient;
    private final EveSsoConfig       ssoConfig;
    private final CharacterSession   characterSession;
    private final ItemTypeRepository itemTypeRepository;
    private final EsiService         esiService;

    /** Build the URL to redirect the browser to for EVE SSO login. */
    public String buildAuthorizationUrl(String state) {
        return SSO_AUTH_URL
                + "?response_type=code"
                + "&client_id=" + ssoConfig.getClientId()
                + "&redirect_uri=" + encode(ssoConfig.getRedirectUri())
                + "&scope=" + encode(SSO_SCOPE)
                + "&state=" + state;
    }

    /**
     * Exchange an authorization code for tokens, decode character info from
     * the JWT, and store everything in {@link CharacterSession}.
     */
    public void exchangeCode(String code) {
        TokenResponse resp = postToTokenEndpoint(
                "grant_type=authorization_code&code=" + code
                        + "&redirect_uri=" + encode(ssoConfig.getRedirectUri()));

        storeTokenResponse(resp);
        fetchAndStoreCorporationId();
        log.info("Logged in as character {} (id={}, corpId={})",
                characterSession.getCharacterName(), characterSession.getCharacterId(),
                characterSession.getCorporationId());
    }

    /**
     * If the stored access token is about to expire, use the refresh token to
     * obtain a new one.
     */
    public void refreshIfNeeded() {
        if (!characterSession.isLoggedIn() || !characterSession.isExpired()) return;

        log.info("Access token expiring — refreshing for character {}", characterSession.getCharacterName());
        TokenResponse resp = postToTokenEndpoint(
                "grant_type=refresh_token&refresh_token=" + characterSession.getRefreshToken());
        storeTokenResponse(resp);
    }

    /**
     * Fetch active sell orders for both the character and their corporation,
     * and return the combined set of listed type IDs.
     */
    /**
     * Returns a map of typeId → set of regionIds for all active sell orders of the
     * character and their corporation. Used by the arbitrage service to grey out
     * opportunities where the character already has a listing in the sell region.
     */
    public Map<Integer, Set<Integer>> fetchCharacterSellOrderRegions() {
        int    charId = characterSession.getCharacterId();
        int    corpId = characterSession.getCorporationId();
        String token  = characterSession.getAccessToken();

        List<CharacterOrderDto> charOrders = webClient.get()
                .uri(ESI_BASE + "/characters/{id}/orders/", charId)
                .header("Authorization", "Bearer " + token)
                .retrieve()
                .bodyToFlux(CharacterOrderDto.class)
                .collectList()
                .block();

        List<CharacterOrderDto> corpOrders = null;
        if (corpId > 0) {
            try {
                corpOrders = webClient.get()
                        .uri(ESI_BASE + "/corporations/{id}/orders/", corpId)
                        .header("Authorization", "Bearer " + token)
                        .retrieve()
                        .bodyToFlux(CharacterOrderDto.class)
                        .collectList()
                        .block();
            } catch (Exception e) {
                log.warn("Could not fetch corporation orders (character may lack Accountant/Trader role): {}", e.getMessage());
            }
        }

        Map<Integer, Set<Integer>> result = new HashMap<>();
        if (charOrders != null) {
            charOrders.stream().filter(o -> !o.isBuyOrder()).forEach(o ->
                    result.computeIfAbsent(o.getTypeId(), k -> new HashSet<>()).add(o.getRegionId()));
        }
        if (corpOrders != null) {
            corpOrders.stream().filter(o -> !o.isBuyOrder()).forEach(o ->
                    result.computeIfAbsent(o.getTypeId(), k -> new HashSet<>()).add(o.getRegionId()));
        }
        return result;
    }

    /**
     * Fetch full details of all active sell orders for the character and corp,
     * resolve type names from the local DB cache, and return as MyOrderDto list.
     */
    public List<MyOrderDto> fetchMyActiveOrders(boolean buyOrders) {
        int    charId = characterSession.getCharacterId();
        int    corpId = characterSession.getCorporationId();
        String token  = characterSession.getAccessToken();

        List<FullOrderDto> charOrders = webClient.get()
                .uri(ESI_BASE + "/characters/{id}/orders/", charId)
                .header("Authorization", "Bearer " + token)
                .retrieve()
                .bodyToFlux(FullOrderDto.class)
                .collectList()
                .block();

        List<FullOrderDto> corpOrders = null;
        if (corpId > 0) {
            try {
                corpOrders = webClient.get()
                        .uri(ESI_BASE + "/corporations/{id}/orders/", corpId)
                        .header("Authorization", "Bearer " + token)
                        .retrieve()
                        .bodyToFlux(FullOrderDto.class)
                        .collectList()
                        .block();
            } catch (Exception e) {
                log.warn("Could not fetch corporation orders for My Orders tab: {}", e.getMessage());
            }
        }

        // Collect all unique type IDs so we can batch-resolve names from local DB
        Set<Integer> typeIds = new HashSet<>();
        if (charOrders  != null) charOrders.forEach(o -> typeIds.add(o.getTypeId()));
        if (corpOrders  != null) corpOrders.forEach(o -> typeIds.add(o.getTypeId()));

        Map<Integer, String> nameMap = new HashMap<>();
        itemTypeRepository.findAllById(typeIds)
                .forEach(it -> nameMap.put(it.getTypeId(), it.getName()));

        // Corp orders first — character endpoint also returns corp orders placed by the character,
        // so process corp first and deduplicate by orderId to avoid double entries.
        Set<Long> seenOrderIds = new HashSet<>();
        List<MyOrderDto> result = new ArrayList<>();

        if (corpOrders != null) {
            corpOrders.stream()
                    .filter(o -> o.isBuyOrder() == buyOrders)
                    .filter(o -> seenOrderIds.add(o.getOrderId()))
                    .map(o -> toMyOrderDto(o, nameMap, "Corporation"))
                    .forEach(result::add);
        }
        if (charOrders != null) {
            charOrders.stream()
                    .filter(o -> o.isBuyOrder() == buyOrders)
                    .filter(o -> seenOrderIds.add(o.getOrderId()))
                    .map(o -> toMyOrderDto(o, nameMap, "Character"))
                    .forEach(result::add);
        }

        result.sort(Comparator.comparing(MyOrderDto::getTypeName,
                Comparator.nullsLast(Comparator.naturalOrder())));
        return result;
    }

    private MyOrderDto toMyOrderDto(FullOrderDto o, Map<Integer, String> nameMap, String source) {
        MyOrderDto dto = new MyOrderDto();
        dto.setOrderId(o.getOrderId());
        dto.setTypeId(o.getTypeId());
        dto.setTypeName(nameMap.getOrDefault(o.getTypeId(), "Type " + o.getTypeId()));
        dto.setRegionId(o.getRegionId());
        dto.setRegionName(REGION_NAMES.getOrDefault(o.getRegionId(), "Region " + o.getRegionId()));
        dto.setLocationId(o.getLocationId());
        dto.setVolumeTotal(o.getVolumeTotal());
        dto.setVolumeRemain(o.getVolumeRemain());
        dto.setPrice(o.getPrice());
        dto.setIssued(o.getIssued());
        dto.setDuration(o.getDuration());
        dto.setRange(o.getRange());
        dto.setSource(source);
        return dto;
    }

    /**
     * Fetch character wallet balance and corporation wallet divisions.
     * Corp wallet returns 403 if character lacks Accountant/Junior Accountant role — handled gracefully.
     */
    public WalletDto fetchWalletData() {
        int    charId = characterSession.getCharacterId();
        int    corpId = characterSession.getCorporationId();
        String token  = characterSession.getAccessToken();

        BigDecimal charBalance = webClient.get()
                .uri(ESI_BASE + "/characters/{id}/wallet/", charId)
                .header("Authorization", "Bearer " + token)
                .retrieve()
                .bodyToMono(BigDecimal.class)
                .block();

        List<WalletDto.CorpDivisionDto> corpDivisions = new ArrayList<>();
        if (corpId > 0) {
            try {
                List<CorpWalletResponseDto> raw = webClient.get()
                        .uri(ESI_BASE + "/corporations/{id}/wallets/", corpId)
                        .header("Authorization", "Bearer " + token)
                        .retrieve()
                        .bodyToFlux(CorpWalletResponseDto.class)
                        .collectList()
                        .block();
                if (raw != null) {
                    for (CorpWalletResponseDto w : raw) {
                        WalletDto.CorpDivisionDto div = new WalletDto.CorpDivisionDto();
                        div.setDivision(w.getDivision());
                        div.setBalance(w.getBalance());
                        corpDivisions.add(div);
                    }
                }
            } catch (Exception e) {
                log.warn("Could not fetch corporation wallets (character may lack Accountant role): {}", e.getMessage());
            }
        }

        WalletDto dto = new WalletDto();
        dto.setCharacterBalance(charBalance != null ? charBalance : BigDecimal.ZERO);
        dto.setCorpDivisions(corpDivisions);
        return dto;
    }

    /**
     * Fetch market transactions for all corporation wallet divisions (1–7),
     * resolve type names from local DB, sort newest-first, and return combined list.
     * Requires esi-wallet.read_corporation_wallets.v1 scope.
     */
    public List<TransactionDto> fetchCorpTransactions() {
        int    corpId = characterSession.getCorporationId();
        String token  = characterSession.getAccessToken();

        if (corpId <= 0) return Collections.emptyList();

        List<CorpTransactionEsiDto> all = new ArrayList<>();
        try {
            List<CorpTransactionEsiDto> divTx = webClient.get()
                    .uri(ESI_BASE + "/corporations/{corpId}/wallets/1/transactions/", corpId)
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .bodyToFlux(CorpTransactionEsiDto.class)
                    .collectList()
                    .block();
            if (divTx != null) {
                divTx.forEach(t -> t.setDivision(1));
                all.addAll(divTx);
            }
        } catch (Exception e) {
            log.warn("Could not fetch corp master wallet transactions: {}", e.getMessage());
        }

        // Resolve type names in batch from local DB
        Set<Integer> typeIds = all.stream().map(CorpTransactionEsiDto::getTypeId).collect(Collectors.toSet());
        Map<Integer, String> nameMap = new HashMap<>();
        itemTypeRepository.findAllById(typeIds).forEach(it -> nameMap.put(it.getTypeId(), it.getName()));

        // Resolve location names via ESI /universe/names/
        Set<Long> locationIds = all.stream().map(CorpTransactionEsiDto::getLocationId).collect(Collectors.toSet());
        Map<Long, String> locationMap = esiService.resolveSystemNamesBatch(locationIds);

        return all.stream()
                .map(t -> toTransactionDto(t, nameMap, locationMap))
                .sorted(Comparator.comparing(TransactionDto::getDate).reversed())
                .collect(Collectors.toList());
    }

    private TransactionDto toTransactionDto(CorpTransactionEsiDto t, Map<Integer, String> nameMap, Map<Long, String> locationMap) {
        TransactionDto dto = new TransactionDto();
        dto.setTransactionId(t.getTransactionId());
        dto.setDate(t.getDate());
        dto.setTypeId(t.getTypeId());
        dto.setTypeName(nameMap.getOrDefault(t.getTypeId(), "Type " + t.getTypeId()));
        dto.setQuantity(t.getQuantity());
        dto.setUnitPrice(t.getUnitPrice());
        dto.setTotalValue(t.getUnitPrice().multiply(BigDecimal.valueOf(t.getQuantity())));
        dto.setBuy(t.isBuy());
        dto.setPersonal(t.isPersonal());
        dto.setClientId(t.getClientId());
        dto.setLocationId(t.getLocationId());
        dto.setLocationName(locationMap.getOrDefault(t.getLocationId(), "Location " + t.getLocationId()));
        dto.setDivision(t.getDivision());
        return dto;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Fetch the character's corporation ID from the public ESI character endpoint. */
    private void fetchAndStoreCorporationId() {
        try {
            CharacterInfoDto info = webClient.get()
                    .uri(ESI_BASE + "/characters/{id}/", characterSession.getCharacterId())
                    .retrieve()
                    .bodyToMono(CharacterInfoDto.class)
                    .block();
            if (info != null && info.getCorporationId() > 0) {
                characterSession.setCorporationId(info.getCorporationId());
            }
        } catch (Exception e) {
            log.warn("Could not fetch corporation ID for character: {}", e.getMessage());
        }
    }

    private TokenResponse postToTokenEndpoint(String formBody) {
        String credentials = ssoConfig.getClientId() + ":" + ssoConfig.getClientSecret();
        String basicAuth   = "Basic " + Base64.getEncoder()
                .encodeToString(credentials.getBytes(StandardCharsets.UTF_8));

        return WebClient.builder()
                .baseUrl(SSO_TOKEN_URL)
                .build()
                .post()
                .header("Authorization", basicAuth)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(BodyInserters.fromValue(formBody))
                .retrieve()
                .bodyToMono(TokenResponse.class)
                .block();
    }

    private void storeTokenResponse(TokenResponse resp) {
        characterSession.setAccessToken(resp.getAccessToken());
        if (resp.getRefreshToken() != null) {
            characterSession.setRefreshToken(resp.getRefreshToken());
        }
        // expires_in is seconds from now
        characterSession.setExpiresAt(
                System.currentTimeMillis() / 1000L + resp.getExpiresIn());

        // Decode character info from the JWT payload (middle Base64 segment)
        String[] parts   = resp.getAccessToken().split("\\.");
        String   payload = new String(
                Base64.getUrlDecoder().decode(padBase64(parts[1])),
                StandardCharsets.UTF_8);

        // sub = "CHARACTER:EVE:12345678"
        String sub  = extractJsonString(payload, "sub");
        String name = extractJsonString(payload, "name");

        int charId = Integer.parseInt(sub.substring(sub.lastIndexOf(':') + 1));
        characterSession.setCharacterId(charId);
        characterSession.setCharacterName(name);
    }

    /** Add Base64 padding if needed. */
    private static String padBase64(String s) {
        return switch (s.length() % 4) {
            case 2  -> s + "==";
            case 3  -> s + "=";
            default -> s;
        };
    }

    /** Minimal JSON string extractor — avoids pulling in a full JSON library for two fields. */
    private static String extractJsonString(String json, String key) {
        String search = "\"" + key + "\":\"";
        int start = json.indexOf(search);
        if (start < 0) return "";
        start += search.length();
        int end = json.indexOf('"', start);
        return json.substring(start, end);
    }

    private static String encode(String s) {
        return java.net.URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    // ── Inner DTOs ────────────────────────────────────────────────────────────

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class TokenResponse {
        @JsonProperty("access_token")  private String accessToken;
        @JsonProperty("refresh_token") private String refreshToken;
        @JsonProperty("expires_in")    private int    expiresIn;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class FullOrderDto {
        @JsonProperty("order_id")      private Long       orderId;
        @JsonProperty("type_id")       private int        typeId;
        @JsonProperty("region_id")     private int        regionId;
        @JsonProperty("location_id")   private long       locationId;
        @JsonProperty("volume_total")  private int        volumeTotal;
        @JsonProperty("volume_remain") private int        volumeRemain;
        @JsonProperty("price")         private BigDecimal price;
        @JsonProperty("is_buy_order")  private boolean    buyOrder;
        @JsonProperty("range")         private String     range;
        @JsonProperty("issued")        private String     issued;
        @JsonProperty("duration")      private int        duration;

        public boolean isBuyOrder() { return buyOrder; }
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class CharacterInfoDto {
        @JsonProperty("corporation_id") private int corporationId;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class CharacterOrderDto {
        @JsonProperty("type_id")      private int     typeId;
        @JsonProperty("region_id")    private int     regionId;
        @JsonProperty("is_buy_order") private boolean buyOrder;

        public boolean isBuyOrder() { return buyOrder; }
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class CorpWalletResponseDto {
        @JsonProperty("division") private int        division;
        @JsonProperty("balance")  private BigDecimal balance;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class CorpTransactionEsiDto {
        @JsonProperty("transaction_id") private long       transactionId;
        @JsonProperty("date")           private String     date;
        @JsonProperty("type_id")        private int        typeId;
        @JsonProperty("quantity")       private int        quantity;
        @JsonProperty("unit_price")     private BigDecimal unitPrice;
        @JsonProperty("is_buy")         private boolean    buy;
        @JsonProperty("is_personal")    private boolean    personal;
        @JsonProperty("client_id")      private long       clientId;
        @JsonProperty("location_id")    private long       locationId;
        // set manually after fetch
        private int division;
    }
}
