import Component from '@ember/component';

export default Component.extend({
  tagName: '',
  actions: {
    update() {
      this.update(...arguments);
    },
  }
});
