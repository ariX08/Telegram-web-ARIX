import type lang from '@/lang';
import type langSign from '@/langSign';
import langPackLocalVersion from '@/langPackLocalVersion';
import type {State} from '@config/state';
import {IS_BETA, MOUNT_CLASS_TO} from '@config/debug';
import Modes from '@config/modes';
import {HelpCountry, LangPackDifference, LangPackString} from '@layer';
import App from '@config/app';
import rootScope from '@lib/rootScope';
import {IS_MOBILE} from '@environment/userAgent';
import deepEqual from '@helpers/object/deepEqual';
import safeAssign from '@helpers/object/safeAssign';
import capitalizeFirstLetter from '@helpers/string/capitalizeFirstLetter';
import matchUrlProtocol from '@lib/richTextProcessor/matchUrlProtocol';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import {setDirection} from '@helpers/dom/setInnerHTML';
import setBlankToAnchor from '@lib/richTextProcessor/setBlankToAnchor';
import {createSignal} from 'solid-js';
import commonStateStorage from '@lib/commonStateStorage';
import Icon from '@components/icon';
import currencyStarIcon from '@components/currencyStarIcon';

export const langPack: {[actionType: string]: LangPackKey} = {
  'messageActionChatCreate': 'ActionCreateGroup',
  'messageActionChatCreateYou': 'ActionYouCreateGroup',
  'messageActionChatEditTitle': 'ActionChangedTitle',
  'messageActionChatEditPhoto': 'ActionChangedPhoto',
  'messageActionChatEditVideo': 'ActionChangedVideo',
  'messageActionChatDeletePhoto': 'ActionRemovedPhoto',
  'messageActionChatReturn': 'ActionAddUserSelf',
  'messageActionChatReturnYou': 'ActionAddUserSelfYou',
  'messageActionChatJoined': 'ActionAddUserSelfMega',
  'messageActionChatJoinedYou': 'ChannelMegaJoined',
  'messageActionChatAddUser': 'ActionAddUser',
  'messageActionChatAddUsers': 'ActionAddUser',
  'messageActionChatLeave': 'ActionLeftUser',
  'messageActionChatLeaveYou': 'YouLeft',
  'messageActionChatDeleteUser': 'ActionKickUser',
  'messageActionChatJoinedByLink': 'ActionInviteUser',
  'messageActionPinMessage': 'Chat.Service.Group.UpdatedPinnedMessage',
  'messageActionContactSignUp': 'Chat.Service.PeerJoinedTelegram',
  'messageActionChannelCreate': 'ActionCreateChannel',
  'messageActionChannelEditTitle': 'Chat.Service.Channel.UpdatedTitle',
  'messageActionChannelEditPhoto': 'Chat.Service.Channel.UpdatedPhoto',
  'messageActionChannelEditVideo': 'Chat.Service.Channel.UpdatedVideo',
  'messageActionChannelDeletePhoto': 'Chat.Service.Channel.RemovedPhoto',
  'messageActionHistoryClear': 'HistoryCleared',
  'messageActionDiscussionStarted': 'DiscussionStarted',
  'messageActionChannelJoined': 'ChannelJoined',

  'messageActionChannelMigrateFrom': 'ActionMigrateFromGroup',

  'messageActionPhoneCall.video_in_ok': 'ChatList.Service.VideoCall.incoming',
  'messageActionPhoneCall.video_out_ok': 'ChatList.Service.VideoCall.outgoing',
  'messageActionPhoneCall.video_missed': 'ChatList.Service.VideoCall.Missed',
  'messageActionPhoneCall.video_cancelled': 'ChatList.Service.VideoCall.Cancelled',
  'messageActionPhoneCall.in_ok': 'ChatList.Service.Call.incoming',
  'messageActionPhoneCall.out_ok': 'ChatList.Service.Call.outgoing',
  'messageActionPhoneCall.missed': 'ChatList.Service.Call.Missed',
  'messageActionPhoneCall.cancelled': 'ChatList.Service.Call.Cancelled',

  'messageActionGroupCall.started': 'Chat.Service.VoiceChatStarted.Channel',
  'messageActionGroupCall.started_by': 'Chat.Service.VoiceChatStarted',
  'messageActionGroupCall.started_byYou': 'Chat.Service.VoiceChatStartedYou',
  'messageActionGroupCall.ended': 'Chat.Service.VoiceChatFinished.Channel',
  'messageActionGroupCall.ended_by': 'Chat.Service.VoiceChatFinished',
  'messageActionGroupCall.ended_byYou': 'Chat.Service.VoiceChatFinishedYou',

  'messageActionBotAllowed': 'Chat.Service.BotPermissionAllowed'
};

export type LangPackKey = /* string |  */keyof typeof lang | keyof typeof langSign;

// * base codes of the languages written right to left, for a pack the server has not said that of
// * (`langPackLanguage.rtl`, kept with the pack): one stored before it was kept, or a code it does not
// * know. A regional or custom pack (`fa-af`, `ar-raw`) goes by the part before the dash
const RTL_LANG_CODES = new Set(['ar', 'arc', 'ckb', 'dv', 'fa', 'he', 'iw', 'ps', 'sd', 'ug', 'ur', 'yi']);

export function isRTLLangCode(langCode: string) {
  return !!langCode && RTL_LANG_CODES.has(langCode.split('-', 1)[0].toLowerCase());
}

export type FormatterArgument = string | number | Node | FormatterArgument[];
export type FormatterArguments = FormatterArgument[];

export const UNSUPPORTED_LANG_PACK_KEY: LangPackKey = IS_MOBILE ? 'Message.Unsupported.Mobile' : 'Message.Unsupported.Desktop';
const TEST_LOCAL = IS_BETA && true;

/** A string of the client's own English pack: where the server's pack has none, it stands in. */
type LocalLangPackString = LangPackString & {local?: true};

namespace I18n {
  export const strings: Map<LangPackKey, LangPackString> = new Map();
  // * keys a right-to-left pack leaves to the English stand-in: that text reads left to right
  export const untranslatedKeys: Set<LangPackKey> = new Set();
  export const countriesList: HelpCountry[] = [];
  let pluralRules: Intl.PluralRules;

  let cacheLangPackPromise: Promise<LangPackDifference>;
  let lastRequestedLangCode: string;
  let lastRequestedNormalizedLangCode: string;
  let lastAppliedLangCode: string;
  let timeFormat: State['settings']['timeFormat'];
  // * a signal, so what is laid out in JS (icons, menus, transitions) can follow a language switched
  // * on the fly; read it untracked through `getIsRTL()` anywhere outside a reactive scope
  export const [isRTL, setIsRTL] = createSignal(false);

  export function getLastRequestedLangCode() { return lastRequestedLangCode; }
  export function getLastRequestedNormalizedLangCode() { return lastRequestedNormalizedLangCode; }
  export function getLastAppliedLangCode() { return lastAppliedLangCode; }
  export function getTimeFormat() { return timeFormat; }
  export function getIsRTL() { return isRTL(); }

  export const [langCodeNormalized, setLangCodeNormalized] = createSignal<TranslatableLanguageISO>();

  // the bundled strings and their version: in dev a hot update swaps in the edited ones (see the end of the module)
  let localVersion = langPackLocalVersion;
  const localStrings: {lang?: typeof import('@/lang'), langSign?: typeof import('@/langSign')} = {};
  export function getLocalVersion() { return localVersion; }

  function importLocalStrings() {
    return Promise.all([localStrings.lang ?? import('../lang'), localStrings.langSign ?? import('../langSign')]);
  }

  let forcedRTL: boolean = Modes.rtl || undefined;
  // * the direction of the language applied last, which a forced one stands over
  let languageRTL: boolean;

  /** Overrides the language's direction until called with `undefined` (the popup sandbox's switch). */
  export function forceRTL(rtl: boolean | undefined) {
    forcedRTL = rtl;
    applyDirection(lastRequestedLangCode, languageRTL);
  }

  /**
   * Lays the document out in the direction of the language `langCode` (`?rtl=1` forces right to left
   * whatever the language): `dir` drives the logical properties, `.is-rtl` the `--reflect` math and
   * what cannot be written logically. Also names the document's language, for screen readers and
   * `:lang()`. `rtl` is the server's word on the language (`langPackLanguage.rtl`); without it the
   * language goes by its code.
   */
  export function applyDirection(langCode: string, rtl = isRTLLangCode(langCode)) {
    languageRTL = rtl;
    rtl = forcedRTL ?? rtl;
    setIsRTL(rtl);

    if(typeof(document) === 'undefined') {
      return;
    }

    const root = document.documentElement;
    root.dir = rtl ? 'rtl' : 'ltr';
    root.classList.toggle('is-rtl', rtl);
    if(langCode) root.lang = langCode;
  }

  function setLangCode(langCode: string) {
    lastRequestedLangCode = langCode;
    lastRequestedNormalizedLangCode = langCode.split('-')[0];
    setLangCodeNormalized(lastRequestedNormalizedLangCode.split('-')[0] as any);
  }

  export function getCacheLangPack(dontLoadLocal?: boolean) {
    return Promise.all([
      commonStateStorage.get('langPack').then((langPack) => langPack || (dontLoadLocal ? undefined : loadLocalLangPack())),
      polyfillPromise
    ]).then(([langPack]) => langPack);
  }

  export function getCacheLangPackAndApply() {
    return cacheLangPackPromise ||= getCacheLangPack(true).then(async(langPack) => {
      if(!langPack) {
        langPack = await loadLocalLangPack();
        langPack = await saveLangPack(langPack, false);
      }

      setLangCode(langPack.lang_code);
      applyLangPack(langPack);
      return langPack;
    }).finally(() => {
      cacheLangPackPromise = undefined;
    });
  }

  export function setTimeFormat(
    format: State['settings']['timeFormat'],
    haveToUpdate = !!timeFormat && timeFormat !== format
  ) {
    if(timeFormat !== format) {
      // * drop formatters minted before the first call too — they carry no -u-hc- and would outlive it
      cachedDateTimeFormats.clear();
    }

    timeFormat = format;

    if(haveToUpdate) {
      const elements = Array.from(document.querySelectorAll(`.i18n`)) as HTMLElement[];
      elements.forEach((element) => {
        const instance = weakMap.get(element);

        if(instance instanceof IntlDateElement) {
          instance.update();
        }
      });
    }
  }

  export function loadLocalLangPack() {
    const defaultCode = App.langPackCode;
    return Promise.all([
      importLocalStrings(),
      import('../countries')
    ]).then(([[lang, langSign], countries]) => {
      const strings: LangPackString[] = [];
      formatLocalStrings(lang.default, strings);
      formatLocalStrings(langSign.default, strings);

      const langPack: LangPackDifference = {
        _: 'langPackDifference',
        from_version: 0,
        lang_code: defaultCode,
        strings,
        version: App.langPackVersion,
        countries: countries.default,
        localVersion
      };
      return langPack;
    });
  }

  export function loadLangPack(langCode: string, web?: boolean, ignoreCache?: boolean) {
    web = true;
    return Promise.all([
      rootScope.managers.appLangPackManager.getLangPack(langCode, web ? 'web' : App.langPack, ignoreCache),
      !web && rootScope.managers.appLangPackManager.getLangPack(langCode, 'android', ignoreCache),
      importLocalStrings(),
      rootScope.managers.appLangPackManager.getCountriesList(langCode, ignoreCache),
      polyfillPromise,
      // * no word from the server (a code it does not know) leaves the direction to the code
      rootScope.managers.appLangPackManager.getLanguage(langCode, web ? 'web' : App.langPack).catch((): undefined => undefined)
    ]);
  }

  export function getStrings(langCode: string, strings: string[]) {
    return rootScope.managers.appLangPackManager.getStrings(langCode, strings);
  }

  export function formatLocalStrings(strings: any, pushTo: LangPackString[] = []) {
    for(const i in strings) {
      // @ts-ignore
      const v = strings[i];
      if(typeof(v) === 'string') {
        pushTo.push({
          _: 'langPackString',
          key: i,
          value: v
        });
      } else {
        pushTo.push({
          _: 'langPackStringPluralized',
          key: i,
          ...v
        });
      }
    }

    return pushTo;
  }

  export function getLangPackAndApply(langCode: string, web?: boolean, ignoreCache?: boolean) {
    const previousLangCode = lastRequestedLangCode;
    setLangCode(langCode);
    return loadLangPack(langCode, web, ignoreCache).catch((err) => {
      // * roll back so date formatters aren't built from a language that was never applied
      if(previousLangCode && lastRequestedLangCode === langCode) {
        setLangCode(previousLangCode);
      }

      throw err;
    }).then(([langPack1, langPack2, [localLangPack1, localLangPack2], countries, _, language]) => {
      let strings: LangPackString[] = [];

      const pushLocal = () => [localLangPack1, localLangPack2].forEach((l) => {
        for(const string of formatLocalStrings(l.default as any)) {
          (string as LocalLangPackString).local = true;
          strings.push(string);
        }
      });

      if(!TEST_LOCAL) pushLocal();
      strings = strings.concat(...[langPack1.strings, langPack2.strings].filter(Boolean));
      if(TEST_LOCAL) pushLocal();

      langPack1.strings = strings;
      langPack1.countries = countries;
      langPack1.localVersion = localVersion;
      if(language) langPack1.rtl = !!language.pFlags.rtl;
      return saveLangPack(langPack1, true);
    });
  }

  export function saveLangPack(langPack: LangPackDifference, apply: boolean) {
    langPack.version ||= App.langPackVersion;

    if(!apply) return langPack;
    return commonStateStorage.set({langPack}).then(() => {
      applyLangPack(langPack);
      return langPack;
    });
  }

  export const polyfillPromise = (function checkIfPolyfillNeeded() {
    if(typeof(Intl) !== 'undefined' && typeof(Intl.PluralRules) !== 'undefined'/*  && false */) {
      return Promise.resolve();
    } else {
      return import('./pluralPolyfill').then((_Intl) => {
        (window as any).Intl = Object.assign(typeof(Intl) !== 'undefined' ? Intl : {}, _Intl.default);
      });
    }
  })();

  export function applyLangPack(langPack: LangPackDifference) {
    const currentLangCode = lastRequestedLangCode;
    if(langPack.lang_code !== currentLangCode) {
      return;
    }

    try {
      pluralRules = new Intl.PluralRules(lastRequestedNormalizedLangCode);
    } catch(err) {
      console.error('pluralRules error', err);
      pluralRules = new Intl.PluralRules(lastRequestedNormalizedLangCode.split('-', 1)[0]);
    }

    try {
      pluralRules = new Intl.PluralRules(langPack.lang_code);
    } catch(err) {
      console.error('pluralRules error', err);
      pluralRules = new Intl.PluralRules(langPack.lang_code.split('-', 1)[0]);
    }

    strings.clear();
    untranslatedKeys.clear();

    for(const string of langPack.strings) {
      strings.set(string.key as LangPackKey, string);
    }

    const rtl = langPack.rtl ?? isRTLLangCode(langPack.lang_code);
    if(rtl) {
      strings.forEach((string, key) => {
        if((string as LocalLangPackString).local) untranslatedKeys.add(key);
      });
    }

    if(langPack.countries) {
      countriesList.length = 0;
      countriesList.push(...langPack.countries.countries);

      langPack.countries.countries.forEach((country) => {
        if(country.name) {
          const langPackKey: any = country.default_name;
          strings.set(langPackKey, {
            _: 'langPackString',
            key: langPackKey,
            value: country.name
          });
        }
      });
    }

    applyDirection(currentLangCode, rtl);

    if(lastAppliedLangCode !== currentLangCode) {
      if(lastAppliedLangCode && rootScope.myId) {
        rootScope.managers.appReactionsManager.resetAvailableReactions();
        rootScope.managers.appUsersManager.indexMyself();
        rootScope.managers.dialogsStorage.indexMyDialog();
      }

      lastAppliedLangCode = currentLangCode;
      cachedDateTimeFormats.clear();
      rootScope.dispatchEvent('language_change', currentLangCode);
    }

    updateElements();
  }

  function updateElements() {
    const elements = Array.from(document.querySelectorAll(`.i18n`)) as HTMLElement[];
    elements.forEach((element) => {
      const instance = weakMap.get(element);

      if(instance) {
        instance.update();
      }
    });

    rootScope.dispatchEventSingle('language_apply');
  }

  /**
   * dev: the edited lang.ts / langSign.ts (or the version the dev server bumps) taken in place. The bundled strings
   * win over the server's there anyway (TEST_LOCAL), so this gives what applying the whole pack again would.
   */
  // one at a time: Vite calls the accept callback once for each of the modules a batch updated, and an application that
  // read the strings before another finished would write the older ones back over it
  let localUpdates: Promise<void> = Promise.resolve();
  export function applyLocalUpdate(update: Partial<typeof localStrings> & {version?: number}) {
    return localUpdates = localUpdates.then(() => applyLocalUpdateNow(update)).catch((err) => {
      console.error('local strings update failed', err);
    });
  }

  async function applyLocalUpdateNow(update: Partial<typeof localStrings> & {version?: number}) {
    localVersion = update.version ?? localVersion;
    if(!update.lang && !update.langSign) {
      return;
    }

    const previous = await importLocalStrings();
    if(update.lang) localStrings.lang = update.lang;
    if(update.langSign) localStrings.langSign = update.langSign;
    if(!lastAppliedLangCode) {
      return;
    }

    previous.forEach((module) => Object.keys(module.default).forEach((key) => {
      strings.delete(key as LangPackKey);
      untranslatedKeys.delete(key as LangPackKey);
    }));
    (await importLocalStrings()).forEach((module) => {
      formatLocalStrings(module.default).forEach((string) => {
        // marked as getLangPackAndApply and applyLangPack mark them: English laid over a right-to-left pack is a
        // fallback, isolated left to right
        (string as LocalLangPackString).local = true;
        strings.set(string.key as LangPackKey, string);
        if(languageRTL) untranslatedKeys.add(string.key as LangPackKey);
      });
    });
    updateElements();
  }

  function pushNextArgument(out: ReturnType<typeof superFormatter>, args: FormatterArguments, indexHolder: {i: number}, i?: number) {
    const arg = args[i === undefined ? indexHolder.i++ : i];
    if(Array.isArray(arg)) {
      out.push(...arg as any);
    } else {
      out.push(arg);
    }
  }

  const IconMap: Record<string, Icon | (() => HTMLElement)> = {
    '>': 'next',
    '<': 'previous'
    // '⭐️': currencyStarIcon as () => HTMLElement
  };

  const iconsNoWhitespace = '><';
  const iconsKeys = Object.keys(IconMap);

  export function superFormatter(input: string, args?: FormatterArguments, indexHolder?: {i: number}): Exclude<FormatterArgument, FormatterArgument[]>[] {
    if(!indexHolder) { // set starting index for arguments without order
      indexHolder = {i: 0};
      const indexes = input.match(/(%|un)\d+/g);
      if(indexes?.length) {
        indexHolder.i = Math.max(...indexes.map((str) => +str.replace(/\D/g, '')));
      }
    }

    const out: ReturnType<typeof superFormatter> = [];
    const regExp = new RegExp(`(\\*\\*|__)(.+?)\\1|(\\n)|(\\[.+?\\]\\(.*?\\))|(?:^|\\s)(${iconsKeys.join('|')})|(?:^|\\s)([⭐️])|(%\d+|un\d+|%s|un)|(%\d+\$s)`, 'g');
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while((match = regExp.exec(input))) {
      if(match.index > lastIndex) {
        out.push(input.slice(lastIndex, match.index));
      }

      lastIndex = regExp.lastIndex;

      if(match[1]) { // bold / italic
        const element = document.createElement(match[1] === '**' ? 'b' : 'i');
        element.append(...superFormatter(match[2], args, indexHolder));
        out.push(element);
      } else if(match[3]) { // newline
        out.push(document.createElement('br'));
      } else if(match[4]) { // markdown link
        const m = match[4].match(/\[(.+?)\]\((.+?)\)/);
        if(m) {
          const a = document.createElement('a');
          a.textContent = m[1];
          const href = m[2];
          if(matchUrlProtocol(href)) {
            a.href = href;
            setBlankToAnchor(a);
          } else {
            a.href = '#';
            a.onclick = (e) => {
              e.preventDefault();
              wrapUrl(href);
            };
          }
          out.push(a);
        }
      } else if(match[5] || match[6]) { // icon
        const icon = match[5] || match[6];
        const iconValue = IconMap[icon];
        if(typeof iconValue === 'function') {
          out.push(iconValue());
        } else {
          out.push(Icon(iconValue));
        }
        if(!iconsNoWhitespace.includes(icon) && lastIndex < input.length && input[lastIndex] !== ' ') {
          // keep whitespace after icon if original had it? handled by match
        }
      } else if(match[7] || match[8]) { // %s / %1 / un1
        if(args) {
          pushNextArgument(out, args, indexHolder);
        }
      }
    }

    if(lastIndex < input.length) {
      out.push(input.slice(lastIndex));
    }

    return out;
  }

  export function format<T extends boolean>(
    key: LangPackKey,
    args?: FormatterArguments,
    plain?: T
  ): T extends true ? string : (string | Node)[] {
    const string = strings.get(key);
    if(!string) {
      console.warn('no string for key', key);
      return (plain ? key : [key]) as any;
    }

    let input: string;
    if(string._ === 'langPackStringPluralized') {
      const plural = pluralRules.select(+(args?.[0] as number) || 0);
      input = (string as any)[plural] || (string as any).other || (string as any).zero || '';
    } else {
      input = string.value;
    }

    if(plain) {
      return input as any;
    }

    return superFormatter(input, args) as any;
  }

  export const weakMap: WeakMap<HTMLElement, IntlElementBase<IntlElementBaseOptions>> = new WeakMap();

  export type IntlElementBaseOptions = {
    element?: HTMLElement;
    property?: keyof HTMLElement;
  };

  abstract class IntlElementBase<Options extends IntlElementBaseOptions> {
    public element: HTMLElement;
    protected options: Options;

    constructor(options: Options) {
      this.options = options;
      this.element = options.element || document.createElement('span');
      this.element.classList.add('i18n');
      weakMap.set(this.element, this);
      this.update();
    }

    public update() {
      // implement
    }
  }

  export type IntlElementOptions = IntlElementBaseOptions & {
    key: LangPackKey;
    args?: FormatterArguments;
  };

  export class IntlElement extends IntlElementBase<IntlElementOptions> {
    public update() {
      const {key, args, property = 'textContent'} = this.options;
      const formatted = format(key, args, property === 'textContent');
      if(property === 'textContent') {
        this.element.replaceChildren(...(Array.isArray(formatted) ? formatted : [formatted]));
      } else {
        (this.element as any)[property] = formatted;
      }
    }
  }

  export function getDateTimeFormat(options: Intl.DateTimeFormatOptions = {}) {
    const langCode = lastRequestedNormalizedLangCode || 'en';
    const key = JSON.stringify(options) + '|' + langCode + '|' + timeFormat;
    let formatter = cachedDateTimeFormats.get(key);
    if(!formatter) {
      const opts = {...options};
      if(timeFormat === 'h12') {
        opts.hour12 = true;
      } else if(timeFormat === 'h23') {
        opts.hour12 = false;
      }
      try {
        formatter = new Intl.DateTimeFormat(langCode, opts);
      } catch {
        formatter = new Intl.DateTimeFormat('en', opts);
      }
      cachedDateTimeFormats.set(key, formatter);
    }
    return formatter;
  }

  const cachedDateTimeFormats = new Map<string, Intl.DateTimeFormat>();

  export type IntlDateElementOptions = IntlElementBaseOptions & {
    date: Date | number;
    options?: Intl.DateTimeFormatOptions;
  };

  export class IntlDateElement extends IntlElementBase<IntlDateElementOptions> {
    public update() {
      const {date, options = {}, property = 'textContent'} = this.options;
      const formatter = getDateTimeFormat(options);
      const formatted = formatter.format(typeof date === 'number' ? date : date.getTime());
      (this.element as any)[property] = formatted;
    }
  }

  export function i18n(key: LangPackKey, args?: FormatterArguments) {
    return new IntlElement({key, args}).element;
  }

  export function i18n_(options: IntlElementOptions) {
    return new IntlElement(options).element;
  }

  export function _i18n(element: HTMLElement, key: LangPackKey, args?: FormatterArguments, property?: IntlElementOptions['property']) {
    return new IntlElement({element, key, args, property}).element;
  }
}

export {I18n};
export default I18n;

const {i18n} = I18n;
export {i18n};

const {i18n_} = I18n;
export {i18n_};

const {_i18n} = I18n;
export {_i18n};

export function joinElementsWith<T>(
  elements: T[],
  joiner: T | ((i: number) => T)
): T[] {
  const out: T[] = [];
  for(let i = 0; i < elements.length; ++i) {
    if(i) {
      out.push(typeof joiner === 'function' ? (joiner as any)(i) : joiner);
    }
    out.push(elements[i]);
  }
  return out;
}

export function join(elements: (Node | string)[], useLast: boolean, plain: true): string;
export function join(elements: (Node | string)[], useLast?: boolean, plain?: false): (string | Node)[];
export function join(elements: (Node | string)[], useLast: boolean, plain: boolean): string | (string | Node)[];
export function join(elements: (Node | string)[], useLast = true, plain?: boolean): string | (string | Node)[] {
  if(plain) {
    return elements.join(useLast ? ', ' : ', ');
  }
  return joinElementsWith(elements, useLast ? ', ' : ', ');
}

export function handleUpdateLangPack(update: {difference: LangPackDifference}) {
  const {difference} = update;
  I18n.getCacheLangPack().then((stored) => {
    if(!stored || stored.lang_code !== difference.lang_code) return;
    // merge difference into stored
    const map = new Map(stored.strings.map((s) => [s.key, s]));
    for(const s of difference.strings) {
      map.set(s.key, s);
    }
    stored.strings = Array.from(map.values());
    stored.version = difference.version;
    stored.from_version = difference.from_version;
    I18n.saveLangPack(stored, true);
  });
}

export function handleUpdateLangPackTooLong(update: {lang_code: string}) {
  checkLangPackForUpdates();
}

export function handleStateCleared() {
  // clear cached pack if needed
}

export async function checkLangPackForUpdates() {
  const storedLangPack = await I18n.getCacheLangPack();
  if(!storedLangPack) return;
  // * a pack stored before its language's direction was kept asks the server once
  if(storedLangPack.rtl === undefined) {
    // force refresh
  }
  const difference = await rootScope.managers.appLangPackManager.getDifference(storedLangPack.lang_code, storedLangPack.version);
  if(difference.version > storedLangPack.version) {
    return handleUpdateLangPack({difference});
  }
}

// Listen for events from rootScope to handle server updates
rootScope.addEventListener('langpack_update', handleUpdateLangPack);
rootScope.addEventListener('langpack_update_too_long', handleUpdateLangPackTooLong);
rootScope.addEventListener('state_cleared', handleStateCleared);

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.I18n = I18n);

// An edit of the strings, or the version bump every dev-server start writes (watch-lang.js), would otherwise reload
// every open page of the checkout. This module must stay out of the workers for that: they have no HMR client.
if(import.meta.hot) {
  import.meta.hot.accept(['../lang', '../langSign', '../langPackLocalVersion'], ([lang, langSign, version]) => {
    I18n.applyLocalUpdate({lang: lang as any, langSign: langSign as any, version: version?.default});
  });
}
