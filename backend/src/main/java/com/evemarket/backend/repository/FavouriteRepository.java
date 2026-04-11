package com.evemarket.backend.repository;

import com.evemarket.backend.model.Favourite;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FavouriteRepository extends JpaRepository<Favourite, Integer> {
}
