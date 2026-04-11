package com.evemarket.backend.controller;

import com.evemarket.backend.dto.FavouriteDto;
import com.evemarket.backend.model.Favourite;
import com.evemarket.backend.repository.FavouriteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/favourites")
@RequiredArgsConstructor
public class FavouriteController {

    private final FavouriteRepository favouriteRepository;

    @GetMapping
    public List<Favourite> getAll() {
        return favouriteRepository.findAll();
    }

    @PostMapping
    public Favourite add(@RequestBody FavouriteDto dto) {
        Favourite fav = new Favourite();
        fav.setTypeId(dto.getTypeId());
        fav.setTypeName(dto.getTypeName());
        return favouriteRepository.save(fav);
    }

    @DeleteMapping("/{typeId}")
    public ResponseEntity<Void> remove(@PathVariable Integer typeId) {
        favouriteRepository.deleteById(typeId);
        return ResponseEntity.noContent().build();
    }
}
