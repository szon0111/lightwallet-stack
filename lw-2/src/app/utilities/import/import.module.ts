import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { ImportView } from '@app/utilities/import/import';
import {ConfigService} from "../../shared/config.service"; // hi

@NgModule({
  declarations: [
    ImportView
  ],
  imports: [
    IonicPageModule.forChild(ImportView),
  ],
  providers: [
    ConfigService
  ]
})
export class ImportComponentModule {}
