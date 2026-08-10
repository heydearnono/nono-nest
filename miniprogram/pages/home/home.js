import { greetingFor } from '../../utils/greeting';

Page({
  data: {
    title: "Nono's Nest",
    hint: '',
  },

  onLoad() {
    this.setData({ hint: greetingFor(new Date().getHours()) });
  },
});
