import { Component } from '@angular/core';
import { File } from '@ionic-native/file';
import * as FileSaver from 'file-saver';
import { AlertController, IonicPage, NavController, NavParams, Platform } from 'ionic-angular';
import { AppService } from 'merit/core/app-settings.service';
import { BwcService } from 'merit/core/bwc.service';
import { Logger } from 'merit/core/logger';
import { PersistenceService } from 'merit/core/persistence.service';
import { ToastConfig } from 'merit/core/toast.config';
import { MeritToastController } from 'merit/core/toast.controller';
import { WalletService } from 'merit/wallets/wallet.service';
import { MeritWalletClient } from 'src/lib/merit-wallet-client';

@IonicPage()
@Component({
  selector: 'view-export-wallet',
  templateUrl: 'export-wallet.html',
})
export class ExportWalletView {

  wallet: MeritWalletClient;
  segment = 'mnemonic';
  accessGranted: boolean;
  formData = {
    password: '',
    repeatPassword: ''
  };
  mnemonic: string;
  qrcode: string;
  private sjcl;

  constructor(private navCtrl: NavController,
              private navParams: NavParams,
              private walletsService: WalletService,
              private alertController: AlertController,
              private persistenceService: PersistenceService,
              private appService: AppService,
              private bwcService: BwcService,
              private toastCtrl: MeritToastController,
              private file: File,
              private platform: Platform,
              private logger: Logger) {
    this.wallet = this.navParams.get('wallet');
    if (this.wallet) {
      this.mnemonic = this.wallet.getMnemonic();
    }
    this.sjcl = this.bwcService.getSJCL();
  }

  ionViewDidLoad() {

    let setQrInfo = (password) => {
      this.walletsService.getEncodedWalletInfo(this.wallet, password).then((info) => {
        this.logger.info('qr info', info);
        this.qrcode = info;
      });
    };

    if (this.walletsService.isEncrypted(this.wallet)) {

      let showPrompt = (highlightInvalid = false) => {
        this.alertController.create({
          title: 'Enter spending password',
          message: 'Spending password required to export this wallet. This is not the password you will use to protect exported file.',
          cssClass: highlightInvalid ? 'invalid-input-prompt' : '',
          inputs: [{
            name: 'password',
            placeholder: 'Password',
            type: 'password'
          }],
          buttons: [
            {
              text: 'Cancel', role: 'cancel', handler: () => {
                this.navCtrl.pop();
              }
            },
            {
              text: 'Ok', handler: (data) => {
                if (!data.password) {
                  showPrompt(true);
                } else {
                  this.walletsService.decrypt(this.wallet, data.password).then(() => {
                    setQrInfo(data.password);
                    this.accessGranted = true;
                  }).catch((err) => {
                    showPrompt()
                  })
                }
              }
            }
          ]
        }).present();
      };
      showPrompt();
    } else {
      setQrInfo(null);
      this.accessGranted = true;
    }
  }

  saveEnabled() {
    return (
      this.formData.password
      && this.formData.password == this.formData.repeatPassword
    )
  }

  async download() {

    const addressbook = await this.persistenceService.getAddressbook(this.wallet.credentials.network);

    let exportData = this.wallet.export({ addressBook: addressbook });
    let encryptedData = this.sjcl.encrypt(this.formData.password, exportData, { iter: 10000 });
    let walletName = this.wallet.credentials.walletName;
    let info: any = await this.appService.getInfo();
    let fileName = `${walletName}-${info.nameCase || ''}.backup.aes.json`;

    const blob = new Blob([encryptedData], { type: 'text/plain;charset=utf-8' });

    if (this.platform.is('ios')) {
      const root = this.file.documentsDirectory;
      await this.file.writeFile(root, fileName, blob);
    } else if (this.platform.is('android')) {
      const root = this.file.externalRootDirectory;
      await this.file.writeFile(root, fileName, blob);
    } else {
      await FileSaver.saveAs(blob, fileName);
    }

    this.toastCtrl.create({ message: `Wallet exported to ${fileName}`, cssClass: ToastConfig.CLASS_MESSAGE }).present();
  }

}