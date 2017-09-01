# capture-lib

TypeScript library to capture the next value from an observable as a promise

Might be helpful when using a library where methods trigger value generation but return neither the value nor a promise that resolves to the value.

## Dependencies

Imports from [rxjs](https://www.npmjs.com/package/rxjs) and [prex](https://www.npmjs.com/package/prex):
```
import { Observable } from "rxjs/Observable";
import { Subscription } from "rxjs/Subscription";
import { ReaderWriterLock, LockHandle } from "prex";
```

## Gist of usage
Import:

```
import { Capture, Captured } from "path/to/capture.lib";
```

Setup:
```
    myCapture: Capture<ValueType> = new Capture<ValueType>( observableToCapture );
```

Capture next value:
```
    promise: Promise<ValueType> = myCapture.start().then( (captured:Captured<ValueType>) => {
        triggerEvent();
        return captured.toPromise();
    }
```
