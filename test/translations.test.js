import {test} from 'node:test';
import assert from 'node:assert/strict';
import {translations, translationKeys, translate, localize, extraTranslations, extraTranslationKeys} from '../public/translations.js';

test('every offered language supplies all interface, safety and gift messages', () => {
  for (const [language, messages] of Object.entries(translations)) {
    assert.equal(messages.length, translationKeys.length, language);
    messages.forEach((message, index) => assert.ok(typeof message === 'string' && message.trim(), `${language}: ${translationKeys[index]}`));
    assert.notEqual(translate(language, 'safetyText'), 'safetyText');
  }
});

test('changing language updates page text, accessibility label and reading direction', () => {
  const label = {dataset:{i18n:'callSanta'}, textContent:''};
  const scene = {setAttribute(name,value){this[name] = value;}};
  const page = {documentElement:{}, querySelectorAll(){return [label]}, getElementById(){return scene}, title:''};
  localize('العربية', page);
  assert.equal(page.documentElement.lang, 'ar');
  assert.equal(page.documentElement.dir, 'rtl');
  assert.equal(label.textContent, 'اتصل بسانتا');
  assert.equal(scene['aria-label'], translate('العربية', 'sceneLabel'));
  localize('Deutsch', page);
  assert.equal(page.documentElement.dir, 'ltr');
  assert.equal(label.textContent, 'Weihnachtsmann anrufen');
});

test('every language includes child disclosure, reporting and urgent help text', () => {
 for (const [language, messages] of Object.entries(extraTranslations)) {
  assert.equal(messages.length, extraTranslationKeys.length, language);
  messages.forEach((message,index)=>assert.ok(typeof message === 'string' && message.trim(), `${language}: ${extraTranslationKeys[index]}`));
 }
});
