import { module, test } from 'qunit';
import { visit, currentURL } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';

module('Acceptance | tutorial', function(hooks) {
	setupApplicationTest(hooks);

	test('should have next button.', async function (assert){
		await visit ('/tutorial');
		assert.equal(find('button'), true)
	})
	test('should show some kind of graphic.', async function (assert){
		await visit ('/tutorial');
		assert.equal(find('.test'), true)
	})
	test('should show some text.', async function (assert){
	})

	test('visiting /tutorial', async function(assert) {
		await visit('/tutorial');

		assert.equal(currentURL(), '/tutorial');
	});
});
