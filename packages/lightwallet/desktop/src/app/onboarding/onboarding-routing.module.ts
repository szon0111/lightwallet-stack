import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OnboardingRootComponent } from '@merit/desktop/app/onboarding/onboarding-root/onboarding-root.component';
import { UnlockComponent } from './unlock/unlock.component';
import { OnboardComponent} from './onboard/onboard.component';

const routes: Routes = [
  {
    path: '',
    component: OnboardingRootComponent,
    children: [
      { path: '', component: OnboardComponent },
      { path: 'unlock', component: UnlockComponent },
      { path: 'import', loadChildren: '../import/import.module#ImportModule' },
      { path: 'import/qr-code', loadChildren: '../import/import-by-qr/import-by-qr.module#ImportByQrModule' },
      { path: 'import/file', loadChildren: '../import/import-with-file/import-with-file.module#ImportWithFileModule' },
      { path: 'import/phrase', loadChildren: '../import/phrase-import/phrase-import.module#PhraseImportModule' }
    ]
  }
];

@NgModule({
  imports: [
    RouterModule.forChild(routes)
  ],
  exports: [RouterModule]
})
export class OnboardingRoutingModule {}
