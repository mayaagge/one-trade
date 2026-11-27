// js/about.js - the About tab: what the words mean, for a player who wants to know.
//
// WHY THIS MODE EXISTS. Playtest feedback said the levels did not explain
// enough. The obvious fix - explain more on the level - makes the level longer,
// and a screen a player has to get through is the wrong place for depth. This
// is the other half of that trade: a level says one thing in one sentence, and
// anybody who wants the rest comes here on purpose. Added 27 November 2026.
//
// NOTHING HERE IS NEEDED TO PLAY, and that is a rule rather than an accident. A
// player who never opens this page misses no instruction and no rule - it
// defines words, it does not carry any.
//
// THE WORDS ARE DATA, in about.json, for the same reason levels.json holds the
// level text: they can be rewritten without touching code, and a reviewer can
// read everything the game says in one file.
//
// Educational, not investment advice.

import { h, button, errorView } from './build.js';
import { DISCLAIMER } from './levels.js';
import { createScreen } from './screen.js';

export const ABOUT_URL = 'about.json';

/**
 * Check an about file over.
 *
 * Light, because nothing here decides a rule or a number: the worst a bad file
 * can do is show less prose than intended. It still refuses a file with no
 * sections, which would render a heading and a blank page.
 */
export function validateAbout(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('about: expected an object');
  if (typeof doc.title !== 'string' || doc.title.length === 0) throw new Error('about: no title');
  if (!Array.isArray(doc.sections) || doc.sections.length === 0) {
    throw new Error('about: expected at least one section');
  }
  const ids = new Set();
  for (const section of doc.sections) {
    if (typeof section.id !== 'string' || section.id.length === 0) {
      throw new Error('about: a section has no id');
    }
    if (ids.has(section.id)) throw new Error(`about: two sections share the id ${section.id}`);
    ids.add(section.id);
    if (typeof section.heading !== 'string' || section.heading.length === 0) {
      throw new Error(`about: section ${section.id} has no heading`);
    }
    const paragraphs = section.paragraphs ?? [];
    if (!Array.isArray(paragraphs)) throw new Error(`about: section ${section.id} has no paragraphs`);
    for (const text of paragraphs) {
      if (typeof text !== 'string' || text.length === 0) {
        throw new Error(`about: section ${section.id} has an empty paragraph`);
      }
    }
    if (section.levels !== undefined && !Array.isArray(section.levels)) {
      throw new Error(`about: section ${section.id}'s levels must be a list`);
    }
  }
  return doc;
}

/**
 * A paragraph, with **bold** runs turned into real emphasis.
 *
 * THE ONE PIECE OF MARKUP THE CONTENT FILE GETS, and it earns its place: the
 * intuition section is four named habits, and a habit whose name is not picked
 * out is a wall of text. Nothing else is interpreted - no links, no lists, no
 * raw HTML - so a sentence in about.json cannot put markup on the page by
 * accident, and nothing in the file can inject an element.
 */
export function paragraph(text) {
  const node = h('p', 'about-text');
  for (const [i, part] of String(text).split('**').entries()) {
    if (part === '') continue;
    // Odd pieces are between a pair of asterisks, and only a CLOSED pair: an
    // unmatched one leaves its text plain rather than emphasising the rest of
    // the paragraph.
    node.append(i % 2 === 1 ? h('strong', null, part) : document.createTextNode(part));
  }
  return node;
}

/** One section: a heading, its paragraphs, and the level list if it has one. */
export function renderSection(section) {
  const node = h('section', 'about-section');
  node.setAttribute('id', `about-${section.id}`);
  node.append(h('h2', 'about-heading', section.heading));
  for (const text of section.paragraphs ?? []) node.append(paragraph(text));
  if (Array.isArray(section.levels)) {
    const list = h('ol', 'about-levels');
    for (const level of section.levels) {
      const item = h('li', 'about-level');
      item.append(h('span', 'about-level-title', `${level.id}. ${level.title}`));
      item.append(h('span', 'about-level-teaches', level.teaches));
      list.append(item);
    }
    node.append(list);
  }
  return node;
}

/** The whole page. */
export function renderAbout(doc) {
  const view = h('div', 'view view-about');
  view.append(h('h1', null, doc.title));

  // NO CONTENTS LIST, AND NO LINKS AT ALL on this page. It had one: eight
  // headings, each an anchor to the section below it. The whole page is text
  // somebody came here to read, and a list of links to things a few hundred
  // pixels further down is navigation for its own sake - it adds a screenful
  // before the first sentence and gives a reader one more decision to make
  // before they can start. Scrolling is the contents list.
  //
  // Links OUT of here are a different thing and still exist: level 6's reveal
  // points at the intuition section, which is a reader being sent somewhere
  // for a reason. tests/about.test.js holds this page to carrying no <a> of
  // its own.

  for (const section of doc.sections) view.append(renderSection(section));

  view.append(button('Back to the levels', 'btn btn-primary btn-wide', () => {
    globalThis.location.hash = '#learn';
  }));
  view.append(h('p', 'disclaimer-inline', DISCLAIMER));
  return view;
}

/** Put the About page on the screen. */
export async function mountAbout(root, { url = ABOUT_URL } = {}) {
  root.replaceChildren(h('p', 'loading', 'Loading…'));
  let doc;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    doc = validateAbout(await response.json());
  } catch (error) {
    root.replaceChildren();
    root.append(errorView('About', `About could not load its text: ${error.message}.`));
    return null;
  }
  // paint(view, key): the key is what tells a redraw from a new screen, and
  // About never redraws - it is one page with no state - so it is always new.
  const paint = createScreen(root);
  paint(renderAbout(doc), 'about');
  return doc;
}
