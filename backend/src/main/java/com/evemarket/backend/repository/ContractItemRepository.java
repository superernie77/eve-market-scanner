package com.evemarket.backend.repository;

import com.evemarket.backend.model.ContractItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ContractItemRepository extends JpaRepository<ContractItem, Long> {

    List<ContractItem> findByContractIdIn(Collection<Long> contractIds);
}
