import { Observable } from "rxjs/Observable";
import { Subscription } from "rxjs/Subscription";
import { ReaderWriterLock, LockHandle } from "prex";  //  https://github.com/rbuckton/prex/blob/master/docs/coordination.md#class-readerwriterlock

export class Capture<T> {
    private locker: ReaderWriterLock = new ReaderWriterLock();

    constructor(
        private target: Observable<T>, // capture next value from this
        private sharedLock?: ReaderWriterLock, // locking this prevents new values from being generated
    ) {
      if( !this.sharedLock ) { this.sharedLock = new ReaderWriterLock(); }
    }

    start(): Promise<Captured<T>> {
        return this.locker.write().then( (locked:LockHandle) => {
            return this.sharedLock.write().then( (shareLocked:LockHandle) => {
                return Promise.resolve( new Captured( locked, this.target, this.sharedLock, shareLocked ) );
            } );
        } );
    }
}

export class Captured<T> {
    private subscription: Subscription;
    private promise: Promise<T>;
    private resolve: Function;
    private reject: Function;
    private value: T;
    private error: any;
    private released: boolean = false;

    constructor(
      private locked: LockHandle, // lock on capturing new values (future calls to capture.start will block until unlocked)
      private target: Observable<T>, // capture next value from this
      private sharedLock?: ReaderWriterLock, // locking this prevents new values from being generated
      shareLocked?: LockHandle, // lock on sharedLock
    ) {
        this.subscription = this.target.subscribe( value => this.observedValue(value), error => this.observedError(error), () => this.observedComplete() );
        if( shareLocked ) { shareLocked.release() };
    }

    public toPromise(): Promise<T> {
      if( !this.promise ) {
        this.promise = new Promise<T>( (resolve,reject) => { this.resolve = resolve; this.reject = reject; } );
        if( this.error ) { this.reject( this.error ); }
        else if( this.value) { this.resolve( this.value); }
      }
      return this.promise;
    }
    public release(): Promise<Captured<T>> {
      //console.debug( "Captured#release: Invoked" );
      if( this.released ) {
        //console.debug( "Captured#release: Already released (probably ok)" );
        return Promise.resolve(this);
      } else {
        return this.sharedLock.write().then( (lock:LockHandle) => {
          //console.debug( "Captured#release: Premature release (probably an error)" );
          this.gotError( new Error( "Captured observable released before emitting a new value" ), lock );
          return Promise.resolve(this);
        } ).catch( (err:any) => {
          //console.debug( "Captured#release: Error handling Premature release = ", err );
          this.error = [ ...this.error, err ];
          this.cleanup();
          return Promise.resolve(this);
        } );
      }
    }

    private gotValue( value:T, lock:LockHandle ) {
        //console.debug( "Captured#gotValue: value = ", value );
        this.value = value;
        if( this.promise ) { this.resolve( this.value ); }
        this.cleanup( lock );
    }

    private gotError( error:any, lock?:LockHandle ){
        //console.debug( "Captured#gotError: storing error = ", error );
        this.error = error;
        if( this.promise ) { this.reject( this.error ); }
        this.cleanup( lock );
    }

    private cleanup( lock?:LockHandle ): void {
        //console.debug( "Captured#cleanup: Invoked" );
        this.subscription.unsubscribe();
        this.locked.release();
        this.subscription = this.resolve = this.reject = this.locked = this.sharedLock = undefined;
        this.released = true;
        if( lock ) { lock.release(); }
        //console.debug( "Captured#cleanup: Complete" );
    }

    private observedValue( value: T ): void { this.sharedLock.write().then( (lock:LockHandle) => this.gotValue(value,lock) ).catch( (err:any) => this.gotError(err) ) }
    private observedError( error: any ): void { this.sharedLock.write().then( (lock:LockHandle) => { this.gotError(error,lock) } ).catch( (err:any) => this.gotError( [error,err] ) ); }
    private observedComplete(): void { this.observedError( new Error( "Captured observable completed without emitting a new value" ) ); }

}
