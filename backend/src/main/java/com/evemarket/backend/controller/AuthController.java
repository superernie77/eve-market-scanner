package com.evemarket.backend.controller;

import com.evemarket.backend.service.CharacterSession;
import com.evemarket.backend.service.EveSsoService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String STATE_KEY      = "eve_oauth_state";
    private static final String FRONTEND_URL   = "http://localhost:4200";

    private final EveSsoService     eveSsoService;
    private final CharacterSession  characterSession;

    /**
     * Kick off the EVE SSO OAuth2 flow.
     * Generates a random state value, stores it in the HTTP session for CSRF
     * protection, then redirects the browser to the EVE SSO authorization page.
     */
    @GetMapping("/login")
    public void login(HttpSession session, HttpServletResponse response) throws IOException {
        String state = UUID.randomUUID().toString();
        session.setAttribute(STATE_KEY, state);
        String authUrl = eveSsoService.buildAuthorizationUrl(state);
        log.info("Redirecting to EVE SSO: {}", authUrl);
        response.sendRedirect(authUrl);
    }

    /**
     * EVE SSO callback — exchanges the authorization code for tokens, then
     * redirects the browser back to the Angular frontend.
     */
    @GetMapping("/callback")
    public void callback(
            @RequestParam String code,
            @RequestParam String state,
            HttpSession session,
            HttpServletResponse response) throws IOException {

        String expectedState = (String) session.getAttribute(STATE_KEY);
        if (expectedState == null || !expectedState.equals(state)) {
            log.warn("OAuth state mismatch — possible CSRF attempt");
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid OAuth state");
            return;
        }

        session.removeAttribute(STATE_KEY);

        try {
            eveSsoService.exchangeCode(code);
        } catch (Exception e) {
            log.error("EVE SSO token exchange failed", e);
            response.sendRedirect(FRONTEND_URL + "?login=error");
            return;
        }

        response.sendRedirect(FRONTEND_URL + "?login=success");
    }

    /**
     * Clear the stored character session (log out).
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout() {
        String name = characterSession.getCharacterName();
        characterSession.clear();
        log.info("Logged out character: {}", name);
        return ResponseEntity.ok(Map.of("status", "logged out"));
    }

    /**
     * Returns the current authentication status so the frontend can show
     * the character name or a login button.
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status() {
        return ResponseEntity.ok(Map.of(
                "loggedIn",       characterSession.isLoggedIn(),
                "characterName",  characterSession.isLoggedIn()
                                         ? characterSession.getCharacterName()
                                         : ""
        ));
    }
}
