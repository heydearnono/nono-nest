/**
 * 小程序入口。
 * 目前只做最小启动逻辑，宠物状态等业务能力后续接入。
 */
App({
  globalData: {
    // 启动时间戳，后续用于计算宠物离线期间的状态变化
    launchedAt: 0,
  },

  onLaunch() {
    this.globalData.launchedAt = Date.now();
  },
});
