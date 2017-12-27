import { Injectable } from '@angular/core';
import { AlertController } from 'ionic-angular';

import { Logger } from 'merit/core/logger';


@Injectable()
export class PopupService {
  constructor(
    public alertCtrl: AlertController,
    private log: Logger
  ) {
  }

  public ionicAlert(title: string, subTitle?: string, okText?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let alert = this.alertCtrl.create({
        title: title,
        subTitle: subTitle,
        buttons: [
          {
            text: okText,
            handler: () => {
              this.log.info('Ok clicked');
              return resolve();
            }
          }
        ]
      });
      alert.present();
    });
  };

  public ionicConfirm(title, message, okText, cancelText): Promise<any> {
    return new Promise((resolve, reject) => {
      let confirm = this.alertCtrl.create({
        title: title,
        message: message,
        buttons: [
          {
            text: cancelText,
            handler: () => {
              this.log.info('Disagree clicked');
              return resolve(false);
            }
          },
          {
            text: okText,
            handler: () => {
              this.log.info('Agree clicked');
              return resolve(true);
            }
          }
        ]
      });
      return confirm.present();
    });
  };

  public ionicPrompt(title: string, message: string, opts: any, okText?: string, cancelText?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let prompt = this.alertCtrl.create({
        title: title,
        message: message,
        inputs: [
          {
            value: opts.defaultText,
            placeholder: opts.placeholder
          },
        ],
        buttons: [
          {
            text: cancelText ? cancelText : 'Cancel',
            handler: data => {
              this.log.info('Cancel clicked');
              return resolve(null);
            }
          },
          {
            text: okText ? okText : 'OK',
            handler: data => {
              this.log.info('Saved clicked');
              return resolve(data[0]);
            }
          }
        ]
      });
      prompt.present();
    });
  }
}