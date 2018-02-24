import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  { path: 'unlock', loadChildren: './unlock/unlock.module#UnlockModule' },
  { path: '', loadChildren: './core/core.module#CoreModule' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
