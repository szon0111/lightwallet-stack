import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { IRootAppState } from '@merit/common/reducers';
import { Store } from '@ngrx/store';

import { Observable } from 'rxjs/Observable';

import { Achievements, Achievement } from '@merit/common/models/achievement';
import { AchievementsService } from '@merit/common/services/achievements.service';

@Component({
  selector: 'app-task-confirm',
  templateUrl: './task-confirm.component.html',
  styleUrls: ['./task-confirm.component.sass'],
})
export class TaskConfirmComponent implements OnInit {
  constructor(private store: Store<IRootAppState>, private AchievementsService: AchievementsService) {}

  @Input() goalName: string;
  @Input() isDone: boolean;
  trackerSettings: boolean = false;
  task: any;

  async ngOnInit() {
    await this.store.select('achievements').subscribe(res => {
      this.trackerSettings = res.settings.isSetupTrackerEnabled;
      this.task = res.achievements.filter((item: any) => item.name === this.goalName)[0];
    });
  }
  ngOnChanges(changes: SimpleChanges) {
    switch (this.goalName) {
      case 'Hide your wallet balance':
        if (this.isDone) {
          this.finishTask();
        }
        return;
      default:
        return;
    }
  }

  finishTask() {
    this.AchievementsService.updateGoal(this.task.id, 0);
  }
}
