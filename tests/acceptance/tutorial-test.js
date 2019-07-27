import { module, test } from 'qunit';
import { visit, currentURL, find } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | tutorial', function(hooks) {
	setupApplicationTest(hooks);

	test('should have next button.', async function (assert){
		await visit ('/tutorial');
		assert.ok(find('button'))
	})
	test('should show some kind of graphic.', async function (assert){
		await visit ('/tutorial');
		assert.ok(find('.tutorial-image'))
	})
	test('should show some text.', async function (assert){
		await visit ('/tutorial');
		assert.ok(find('.tutorial-text'))
	})

	test('visiting /tutorial', async function(assert) {
		await visit('/tutorial');

		assert.equal(currentURL(), '/tutorial');
	});
});
