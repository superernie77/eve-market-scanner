package com.evemarket.backend.service;

import org.springframework.stereotype.Component;

/**
 * Singleton in-memory store for the currently authenticated EVE character.
 * Only supports a single logged-in user (this is a local tool).
 */
@Component
public class CharacterSession {

    private volatile String accessToken;
    private volatile String refreshToken;
    private volatile long   expiresAt;      // Unix epoch seconds
    private volatile int    characterId;
    private volatile String characterName;
    private volatile int    corporationId;

    public boolean isLoggedIn() {
        return accessToken != null && !accessToken.isBlank();
    }

    /** True if the access token has expired or will expire within the next 60 seconds. */
    public boolean isExpired() {
        return System.currentTimeMillis() / 1000L >= expiresAt - 60;
    }

    public void clear() {
        accessToken   = null;
        refreshToken  = null;
        expiresAt     = 0;
        characterId   = 0;
        characterName = null;
        corporationId = 0;
    }

    // ── Getters & Setters ────────────────────────────────────────────────────

    public String getAccessToken()  { return accessToken; }
    public void setAccessToken(String t) { this.accessToken = t; }

    public String getRefreshToken() { return refreshToken; }
    public void setRefreshToken(String t) { this.refreshToken = t; }

    public long getExpiresAt()      { return expiresAt; }
    public void setExpiresAt(long e) { this.expiresAt = e; }

    public int getCharacterId()     { return characterId; }
    public void setCharacterId(int id) { this.characterId = id; }

    public String getCharacterName() { return characterName; }
    public void setCharacterName(String name) { this.characterName = name; }

    public int getCorporationId()    { return corporationId; }
    public void setCorporationId(int id) { this.corporationId = id; }
}
