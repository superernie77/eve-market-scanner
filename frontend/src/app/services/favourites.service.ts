import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';
import { Favourite } from '../models/market-offer.model';

const API = 'http://localhost:8080/api/favourites';

@Injectable({ providedIn: 'root' })
export class FavouritesService {
  private http = inject(HttpClient);

  private _favourites = new BehaviorSubject<Favourite[]>([]);
  favourites$ = this._favourites.asObservable();

  get favouriteTypeIds(): Set<number> {
    return new Set(this._favourites.value.map(f => f.typeId));
  }

  load() {
    this.http.get<Favourite[]>(API).subscribe(favs => this._favourites.next(favs));
  }

  add(typeId: number, typeName: string) {
    return this.http.post<Favourite>(API, { typeId, typeName }).pipe(
      tap(() => {
        const current = this._favourites.value;
        if (!current.find(f => f.typeId === typeId)) {
          this._favourites.next([...current, { typeId, typeName }]);
        }
      })
    );
  }

  remove(typeId: number) {
    return this.http.delete(`${API}/${typeId}`).pipe(
      tap(() => {
        this._favourites.next(this._favourites.value.filter(f => f.typeId !== typeId));
      })
    );
  }

  isFavourite(typeId: number): boolean {
    return this._favourites.value.some(f => f.typeId === typeId);
  }
}
