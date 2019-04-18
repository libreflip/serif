import Controller from '@ember/controller';
import Hammer from 'hammerjs';

const hammertime = new Hammer(document.body, {});
function scroll(ev) {
	document.body.scrollTop += (ev.deltaX / 10);
}
hammertime.on('panleft', scroll);
hammertime.on('panright', scroll);


export default Controller.extend({
  step: '',
});