import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/** Signed-out visitors go to the sign-in page, which brings them back here afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthService).ensure().pipe(
    map((user) => user ? true : router.createUrlTree(['/login'], { queryParams: { next: state.url } })),
  );
};

/** The sign-in and sign-up pages are for signed-out visitors only. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthService).ensure().pipe(map((user) => user ? router.createUrlTree(['/']) : true));
};
