import Route from '@ember/routing/route';

export default Route.extend({
	model(){
		return [{
			index: 0,
			title: 'Welcome',
			text: 'To start, first measure the width of a page and enter the value in millimeters below:',
			image: '/measure.gif',
			hasInput: true
		},{
			index: 1,
			title: '',
			text: 'Now place the book in the cradle:',
			image: '/cradle.gif',
			hasInput: false
		},{
			index: 2,
			title: '',
			text: 'Adjust the cradle to fit the thickness of the book:',
			image: '/adjust.gif',
			hasInput: false
		},{
			index: 3,
			title: '',
			text: 'Now press the big red button:',
			image: '/button.gif',
			hasInput: false
		}]
	},
});
