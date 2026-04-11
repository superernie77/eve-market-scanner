package com.evemarket.backend.controller;

import com.evemarket.backend.dto.WalletDto;
import com.evemarket.backend.service.CharacterSession;
import com.evemarket.backend.service.EveSsoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/wallet")
@RequiredArgsConstructor
public class WalletController {

    private final CharacterSession characterSession;
    private final EveSsoService    eveSsoService;

    /**
     * Returns wallet balances for the logged-in character and their corporation.
     * Returns an empty WalletDto if no character is authenticated.
     */
    @GetMapping
    public ResponseEntity<WalletDto> getWallet() {
        if (!characterSession.isLoggedIn()) {
            WalletDto empty = new WalletDto();
            empty.setCharacterBalance(null);
            empty.setCorpDivisions(List.of());
            return ResponseEntity.ok(empty);
        }
        try {
            eveSsoService.refreshIfNeeded();
            return ResponseEntity.ok(eveSsoService.fetchWalletData());
        } catch (Exception e) {
            WalletDto empty = new WalletDto();
            empty.setCharacterBalance(BigDecimal.ZERO);
            empty.setCorpDivisions(List.of());
            return ResponseEntity.ok(empty);
        }
    }
}
