package com.evemarket.backend.controller;

import com.evemarket.backend.dto.TransactionDto;
import com.evemarket.backend.service.CharacterSession;
import com.evemarket.backend.service.EveSsoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/transactions")
@RequiredArgsConstructor
public class TransactionController {

    private final CharacterSession characterSession;
    private final EveSsoService    eveSsoService;

    @GetMapping("/corp")
    public ResponseEntity<List<TransactionDto>> getCorpTransactions() {
        if (!characterSession.isLoggedIn()) return ResponseEntity.ok(List.of());
        try {
            eveSsoService.refreshIfNeeded();
            return ResponseEntity.ok(eveSsoService.fetchCorpTransactions());
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
    }
}
