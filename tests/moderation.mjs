import assert from 'node:assert/strict';
import { test } from 'node:test';
import { screen } from '../server/moderation.ts';

void test('clean civic text is allowed, including Scunthorpe-problem words', () => {
  for (const text of [
    'A covered seating area near the library for rainy days.',
    'I want Waterloo to add more class options at the community centre.',
    'Please assess the assassin storyline in the local play, it was great.',
    'We need better bus passes and grass maintenance in the park.',
    'Add a cucumber stand and more analysis of traffic flow.',
    '', // empty
    '   ', // whitespace only
  ])
    assert.equal(screen(text).action, 'allow', text);
});

void test('hard slurs and explicit sexual terms are rejected', () => {
  for (const text of [
    'you are a faggot',
    'build more rape alarms downtown', // explicit term in context
    'what a cunt that councillor is',
  ]) {
    const result = screen(text);
    assert.equal(result.action, 'reject', text);
    assert.ok(result.matched, 'a matched term is reported');
  }
});

void test('leetspeak, spacing, and repeated letters do not evade the hard list', () => {
  for (const text of ['f@ggot', 'f a g g o t', 'faaaggot', 'n1gger'])
    assert.equal(screen(text).action, 'reject', text);
});

void test('general profanity lands in pending, not rejected', () => {
  for (const text of [
    'this is a shit idea honestly',
    'the fucking potholes are everywhere',
    'what an asshole move by the developer',
  ])
    assert.equal(screen(text).action, 'pending', text);
});

void test('common inflections of profanity still screen as pending', () => {
  for (const text of ['so many potholes, bitches', 'it is shitty downtown'])
    assert.equal(screen(text).action, 'pending', text);
});
