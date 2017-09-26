'use strict';

angular
  .module('copayApp.controllers')
  .controller('networkDetailsController', function(
    $rootScope,
    $log,
    $scope,
    $timeout,
    lodash,
    gettextCatalog,
    txFormatService,
    profileService,
    walletService
  ) {
    $scope.$on('$ionicView.beforeEnter', function(event, data) {
      $scope.wallet = profileService.getWallet(data.stateParams.walletId);
      $scope.fetchingAnv = true;

      walletService.getANV($scope.wallet, function(err, anv) {
        $scope.fetchingAnv = false;

        if (err) {
          $scope.error = err;
        }

        $timeout(function() {
          $scope.anv = txFormatService.parseAmount(anv, 'sat');
        });
      });
    });
  });
