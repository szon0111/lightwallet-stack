import * as Promise from 'bluebird';
import { Injectable } from '@angular/core';

import { HttpClient } from '@angular/common/http';
import {Logger} from "merit/core/logger";

@Injectable()
export class AppUpdateService {

  constructor(
    private http:HttpClient,
    private logger:Logger
  ) {}

  //TODO It's a mock now!!
  public isUpdateAvailable():Promise<boolean> {
    return Promise.resolve(false);
  }
}
