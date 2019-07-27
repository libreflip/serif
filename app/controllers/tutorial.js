import Controller from '@ember/controller';

export default Controller.extend({
	currentIndex: 0,
	finalIndex: 3,
	actions: {
		next: function() {
			if(this.currentIndex < this.finalIndex){
				this.set('currentIndex', this.currentIndex+1);
			}
		}
	}
});
