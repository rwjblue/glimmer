import { InternedString, intern, dict } from 'glimmer-util';
import { PathReference } from './path';
import { Dict, HasGuid } from 'glimmer-util';
import { RootReference as IRootReference, PathReference as IPathReference, NotifiableReference } from 'glimmer-reference';
import PushPullReference from './push-pull';

export default class RootReference extends PushPullReference implements IRootReference, IPathReference {
  private object: any;
  private chains = dict<PathReference>();

  constructor(object: any) {
    super();
    this.object = object;
  }

  isDirty() { return false; }

  value() { return this.object; }

  update(object: any) {
    this.object = object;
    this.notify();
  }

  get(prop: InternedString): IPathReference {
    var chains = this.chains;
    if (<string>prop in chains) return chains[<string>prop];
    return (chains[<string>prop] = new PathReference(this, prop));
  }

  chainFor(prop: InternedString): IPathReference {
    let chains = this.chains;
    if (<string>prop in chains) return chains[<string>prop];
    return null;
  }

  path(string) {
    return string.split('.').reduce((ref, part) => ref.get(intern(part)), this);
  }

  referenceFromParts(parts: InternedString[]): IPathReference {
    return parts.reduce((ref, part) => ref.get(part), <IPathReference>this);
  }

  label() {
    return '[reference Root]';
  }
}
