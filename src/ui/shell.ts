import '../styles.css'
import { watchOtherTabs } from '../lib/cellar'
import { hydrateMissing } from '../lib/hydrate'
import { initLang, t, subscribe as onLangChange } from '../lib/lang'
import { ModeSwitch } from './elements/mode-switch'
import { AppStatus } from './elements/app-status'
import { AppPanel } from './elements/app-panel'
import { AppHead } from './elements/app-head'
import { AppFoot } from './elements/app-foot'
import { MyWines } from './elements/my-wines'
import { FindPanel } from './elements/find-panel'
import { LangToggle } from './elements/lang-toggle'

/**
 * The app entry point.
 *
 * This file registers the custom elements and does the handful of one-off
 * wirings that belong to the document rather than to any section. What it
 * deliberately does *not* contain is a list of `subscribe(render)` calls: each
 * element subscribes for itself, so a new section cannot be added and left
 * unwired, and a tab switch cannot leak a listener.
 */

/**
 * Definitions must be registered before any markup emitting these tags is
 * parsed or mounted. An unknown tag parses fine and sits inert, so getting
 * this wrong produces a blank section rather than an error. Everything is in
 * one bundle and the shell markup is static, so ordering here is enough.
 */
const ELEMENTS: Array<[string, CustomElementConstructor]> = [
  ['mode-switch', ModeSwitch],
  ['app-status', AppStatus],
  ['app-panel', AppPanel],
  ['app-head', AppHead],
  ['app-foot', AppFoot],
  ['my-wines', MyWines],
  ['find-panel', FindPanel],
  ['lang-toggle', LangToggle],
]

export function defineElements(): void {
  for (const [tag, ctor] of ELEMENTS) {
    if (!customElements.get(tag)) customElements.define(tag, ctor)
  }
}

export function start(): void {
  defineElements()

  // Before anything renders: the detected language has to reach the catalog
  // and <html lang> or the first paint is English chrome over a French index.
  initLang()

  // Notification, not merge — two tabs are last-write-wins by design. This
  // exists so the losing tab stops showing a list that is no longer true.
  watchOtherTabs()

  // Returns without touching the network on virtually every load: a wine is
  // cached when it is added, so only imported entries are ever missing one. Failures are the user's list being briefly incomplete, not
  // something to interrupt them over.
  void hydrateMissing().catch(() => {})

  const about = document.querySelector('.topbar-link')
  const showAbout = (): void => { if (about) about.textContent = t().aboutProject }
  showAbout()
  onLangChange(showAbout)
}

start()
