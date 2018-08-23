import { Injectable } from '@angular/core';
import { Actions, Effect, ofType } from '@ngrx/effects';
import { Observable } from 'rxjs/Observable';
import { Store } from '@ngrx/store';
import {
  IMiningDataset,
  MiningActions,
  selectIsMining,
  selectMiningDatasets,
  SetMiningStoppedAction,
  UpdateGPUInfoAction,
  UpdateMiningConnectionAction,
  UpdateMiningDatasetsAction,
  UpdateMiningStatsAction
} from '@merit/common/reducers/mining.reducer';
import { debounceTime, delay, expand, filter, map, switchMap, take, takeWhile, tap } from 'rxjs/operators';
import { IRootAppState } from '@merit/common/reducers';
import { ElectronService } from '../../desktop/src/services/electron.service';
import { pick } from 'lodash';
import { IGPUInfo } from '../../desktop/src/app/core/mining/gpu-info.model';
import { of } from 'rxjs/observable/of';
import { interval } from 'rxjs/observable/interval';

const borderColors: string[] = ['#00b0dd', '#2eb483'];
const baseDataset: IMiningDataset = {} as IMiningDataset;

function updateGpuDatasets(gpuInfo: IGPUInfo[], gpuTemp: IMiningDataset[], gpuUtil: IMiningDataset[]) {
  if (!gpuTemp.length) {
    gpuInfo.forEach((data: IGPUInfo, i: number) => {
      gpuTemp.push({
        ...baseDataset,
        series: [],
        name: data.title
      });

      gpuUtil.push(
        {
          ...baseDataset,
          series: [],
          name: data.title + ' cores'
        },
        {
          ...baseDataset,
          series: [],
          name: data.title + ' memory'
        }
      );
    });
  }

  const t: Date = new Date();

  gpuInfo.forEach((data: IGPUInfo, i: number) => {
    gpuTemp[i].series.push({
      name: t,
      value: data.temperature
    });

    gpuUtil[i * 2].series.push({
      name: t,
      value: data.gpu_util
    });

    gpuUtil[i * 2 + 1].series.push({
      name: t,
      value: data.memory_util
    });
  });

  // keep only most recent 100 in memory
  if(gpuTemp.length > 0) {
    const cutOff = gpuTemp[0].series.length - 100;
    if (cutOff > 0) {
      gpuTemp.forEach(ds => ds.series.splice(0, cutOff));
      gpuUtil.forEach(ds => ds.series.splice(0, cutOff));
    }
  }
}

function updateMiningStats(stats: any, cyclesAndShares: IMiningDataset[], graphs: IMiningDataset[]) {
  const t: Date = new Date();

  if (!cyclesAndShares.length) {
    cyclesAndShares.push(
      {
        ...baseDataset,
        series: [],
        name: 'Cycles'
      },
      {
        ...baseDataset,
        series: [],
        name: 'Shares'
      }
    );

    graphs.push({
      ...baseDataset,
      series: [],
      name: 'Graphs'
    });
  }

  cyclesAndShares[0].series.push({
    name: t,
    value: stats.total.cycles + stats.current.cycles
  });

  cyclesAndShares[1].series.push({
    name: t,
    value: stats.total.shares + stats.current.shares
  });

  graphs[0].series.push({
    name: t,
    value: stats.total.attempts + stats.current.attempts
  });

  // keep only most recent 200 in memory
  const cutOff = graphs[0].series.length - 200;
  if (cutOff > 0) {
    cyclesAndShares[0].series.splice(0, cutOff);
    cyclesAndShares[1].series.splice(0, cutOff);
    graphs[0].series.splice(0, cutOff);
  }
}

@Injectable()
export class MiningEffects {
  _isMining: boolean = true;
  _isStopping: boolean = true;

  @Effect({dispatch: false})
  onStart$: Observable<any> = this.actions$.pipe(
    ofType(MiningActions.StartMining),
    switchMap(() =>
      of(null)
        .pipe(
          expand(() =>
            this.store$.select(selectMiningDatasets)
              .pipe(
                take(1),
                tap(({gpuTemp, gpuUtil, cyclesAndShares, graphs}) => {
                  const connected = ElectronService.isConnectedToPool();
                  this.store$.dispatch(new UpdateMiningConnectionAction(connected));

                  if (!connected) {
                    return;
                  }

                  const stats = ElectronService.getMiningStats();
                  const gpuInfo = ElectronService.GPUDevicesInfo()
                    .map(info => pick(info, 'id', 'title', 'total_memory', 'temperature', 'gpu_util',
                      'memory_util', 'fan_speed'));

                  updateGpuDatasets(gpuInfo, gpuTemp, gpuUtil);
                  updateMiningStats(stats, cyclesAndShares, graphs);

                  this.store$.dispatch(new UpdateMiningDatasetsAction({gpuTemp, gpuUtil, cyclesAndShares, graphs}));
                  this.store$.dispatch(new UpdateMiningStatsAction(stats));
                  this.store$.dispatch(new UpdateGPUInfoAction(gpuInfo))

                }),
                switchMap(() =>
                  this.store$.select(selectIsMining)
                    .pipe(
                      take(1)
                    )
                ),
                tap(isMining => {
                  if (this._isMining = isMining) {
                    this._isStopping = true;
                  }
                }),
                delay(5000)
              )
          ),
          takeWhile(() => this._isMining)
        )
    )
  );

  @Effect()
  onStop$: Observable<SetMiningStoppedAction> = this.actions$.pipe(
    ofType(MiningActions.StopMining),
    tap(() => {
      ElectronService.stopMining();
      this._isStopping = ElectronService.isStopping();
    }),
    switchMap(() =>
      this._isStopping ?
        interval(100)
          .pipe(
            takeWhile(() => this._isStopping = ElectronService.isStopping()),
            debounceTime(600),
          )
        :
        of(null)
    ),
    map(() => new SetMiningStoppedAction())
  );

  constructor(private actions$: Actions,
              private store$: Store<IRootAppState>) {
  }
}
