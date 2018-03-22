import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DashboardGuard } from '@merit/desktop/app/guards/dashboard.guard';
import { OnboardingGuard } from '@merit/desktop/app/guards/onboarding.guard';

const routes: Routes = [
  { path: 'onboarding', loadChildren: './onboarding/onboarding.module#OnboardingModule', canActivate: [OnboardingGuard] },
  { path: '', loadChildren: './core/core.module#CoreModule', canActivate: [DashboardGuard] }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
