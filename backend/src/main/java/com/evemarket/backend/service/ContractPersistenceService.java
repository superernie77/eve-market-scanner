package com.evemarket.backend.service;

import com.evemarket.backend.model.Contract;
import com.evemarket.backend.model.ContractItem;
import com.evemarket.backend.repository.ContractItemRepository;
import com.evemarket.backend.repository.ContractRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ContractPersistenceService {

    private final ContractRepository contractRepository;
    private final ContractItemRepository contractItemRepository;

    @Transactional
    public void saveAll(List<Contract> contracts, List<ContractItem> items) {
        contractRepository.saveAll(contracts);
        contractItemRepository.saveAll(items);
    }
}
