package com.evemarket.backend.repository;

import com.evemarket.backend.model.ContractItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Set;

public interface ContractItemRepository extends JpaRepository<ContractItem, Long> {

    List<ContractItem> findByContractIdIn(Collection<Long> contractIds);

    @Query("SELECT DISTINCT ci.groupId FROM ContractItem ci WHERE ci.groupId IS NOT NULL AND ci.isRig IS NULL")
    Set<Integer> findDistinctGroupIdsWithNullIsRig();

    @Modifying
    @Transactional
    @Query("UPDATE ContractItem ci SET ci.isRig = true WHERE ci.isRig IS NULL AND ci.groupId IN :rigGroupIds")
    void markAsRig(@Param("rigGroupIds") Collection<Integer> rigGroupIds);

    @Modifying
    @Transactional
    @Query("UPDATE ContractItem ci SET ci.isRig = false WHERE ci.isRig IS NULL")
    void markNonRigRemaining();

    @Modifying
    @Transactional
    @Query("DELETE FROM ContractItem ci WHERE ci.contractId IN :contractIds")
    void deleteByContractIdIn(@Param("contractIds") Collection<Long> contractIds);
}
