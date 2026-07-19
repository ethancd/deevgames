import React, {useEffect, useState} from "react";
import { postUserData } from "./ajax";
import { HeroProps} from "./hero";

type TypeableNameProps = Pick<HeroProps, 'name' | 'isDefaultName'>

export default function TypeableName ({ name, isDefaultName }: TypeableNameProps): JSX.Element {
  const DEBOUNCE_DELAY_MS = 2000
  const [typedName, setTypedName] = useState(isDefaultName ? '' : name);

  useEffect(() => {
    const timeoutId = setTimeout(() => postUserData({name: typedName}), DEBOUNCE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [typedName]);

  const onKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.target.blur();
    }
  }

  return (
    <div className="name">
      <textarea
        onKeyDown={onKeyDown}
        onChange={e => setTypedName(e.target.value)}
        value={typedName}
        maxLength={16}
        rows={1}
        spellCheck={false}
        tabIndex={-1}
        placeholder={isDefaultName ? name : ''}></textarea>
    </div>
  )
}