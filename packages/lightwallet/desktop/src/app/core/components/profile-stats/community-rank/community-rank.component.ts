import { Component, OnInit, Input } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-community-rank',
  templateUrl: './community-rank.component.html',
  styleUrls: ['./community-rank.component.sass'],
  animations: [
    trigger('showTips', [
      state('true', style({ maxHeight: '1000px', padding: '30px 20px' })),
      state('false', style({})),
      transition('* => *', animate('100ms ease-in-out')),
    ]),
  ],
})
export class CommunityRankComponent implements OnInit {
  constructor() {}

  @Input() active: boolean;

  ngOnInit() {}
}
