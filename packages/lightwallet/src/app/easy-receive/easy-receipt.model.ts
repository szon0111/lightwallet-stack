export class EasyReceipt  {

  parentAddress:string;
  senderName:string;
  secret:string;
  senderPublicKey:string;
  blockTimeout:number;
  deepLinkURL:string;
  checkPassword:boolean;

  constructor(fields:any) {
    for (const f in fields) {
      this[f] = fields[f];
    }
  }

  // TODO: Actually validate that the sizes/shapes of the parameters are correct.
  isValid() {
    return (
      this.parentAddress
      && this.senderPublicKey
      && this.secret
      && this.blockTimeout
    );
  }

}
