// -------------------------------------------------------------------------- \\
// File: LiveQuery.js                                                         \\
// Module: DataStore                                                          \\
// Requires: Core, Foundation, Status.js                                      \\
// Author: Neil Jenkins                                                       \\
// License: © 2010-2014 FastMail Pty Ltd. MIT Licensed.                       \\
// -------------------------------------------------------------------------- \\

"use strict";

( function ( NS ) {

var Status = NS.Status,
    READY = Status.READY,
    DESTROYED = Status.DESTROYED;

var numerically = function ( a, b ) {
    return a - b;
};

/**
    Class: O.LiveQuery

    Extends: O.Object

    Includes: O.ObserverableRange, O.Enumerable

    A LiveQuery instance can be treated as an observable array which
    automatically updates its contents to reflect a certain query on the store.
    A query consists of a particular type, a filter function and a sort order.
    Normally you will not create a LiveQuery instance yourself but get it by
    retrieving the query from the store.
 */
var LiveQuery = NS.Class({

    Extends: NS.Object,

    Mixin: [ NS.ObservableRange, NS.Enumerable ],

    /**
        Property: O.LiveQuery#id
        Type: String

        A unique identifier for this query.
    */
    id: function () {
        return NS.guid( this );
    }.property().nocache(),

    /**
        Property (private): O.LiveQuery#_filter
        Type: (Function|null)

        The function to filter data objects with.
    */

    /**
        Property (private): O.LiveQuery#_sort
        Type: (Function|null)

        The function to sort the data objects with.
    */

    /**
        Property: O.LiveQuery#store
        Type: O.Store

        The store to query for records.
    */

    /**
        Property: O.LiveQuery#Type
        Type: O.Class

        The Record class constructor function for the type of the instances to
        include in this query.
    */

    /**
        Property: O.LiveQuery#status
        Type: O.Status

        Status of the query: READY|DESTROYED
    */

    /**
        Constructor: O.LiveQuery

        The following properties should be configured:

        store  - {O.Store} The store to query for records.
        Type   - {O.Class} The constructor for the record type this query is a
                 collection of.
        filter - {Function} (optional) If supplied, only records which this
                 function returns a truthy value for are included in the
                 results.
        sort   - {(String|String[]|Function)} (optional) The records in
                 the local query are sorted according to this named property. If
                 an array is supplied, in the case of a tie the next property in
                 the array will be consulted. If a function is supplied, this is
                 used as the sort function directly on the records. If nothing
                 is supplied, the results are not guaranteed to be in any
                 particular order.

        Parameters:
            mixin - {Object} The properties for the query.
    */
    init: function ( mixin ) {
        var Type = mixin.Type,
            sort = mixin.sort,
            store = mixin.store || this.store,
            results;

        if ( sort && !( sort instanceof Function ) ) {
            sort = mixin.sort = NS.sortByProperties( sort );
        }
        results = store.findAll( Type, mixin.filter, sort );

        this._storeKeys = results;
        this._sort = results.sortFn;
        this._filter = results.filterFn;

        this.status = store.getTypeStatus( Type ) & READY;

        this.length = results.length;

        LiveQuery.parent.init.call( this, mixin );

        store.addQuery( this );
    },

    /**
        Method: O.LiveQuery#destroy

        Call this method when you have finished with a local query to ensure it
        does not continue monitoring the store for changes and can be garbage
        collected.
    */
    destroy: function () {
        this.set( 'status', DESTROYED );
        this.get( 'store' ).removeQuery( this );
        LiveQuery.parent.destroy.call( this );
    },

    /**
        Method: O.LiveQuery#is

        Checks whether the query has a particular status.

        Parameters:
            status - {O.Status} The status to check.

        Returns:
            {Boolean} True if the record has the queried status.
    */
    is: function ( status ) {
        return !!( this.get( 'status' ) & status );
    },

    /**
        Property: O.LiveQuery#[]
        Type: Array

        A standard array of record objects for the records in this query.
    */
    '[]': function () {
        var store = this.get( 'store' ),
            Type = this.get( 'Type' );
        return this._storeKeys.map( function ( storeKey ) {
            return store.materialiseRecord( storeKey, Type );
        });
    }.property(),

    /**
        Property: O.LiveQuery#length
        Type: Number

        The number of records in the query.
    */

    /**
        Method: O.LiveQuery#indexOfId

        Finds the index of an id in the query. If the id is not found, the index
        returned will be -1.

        Parameters:
            id       - {String} The record id to find.
            from     - {Number} The first index to start the search from.
                       Specify 0 to search the whole list.
            callback - {Function} (optional) A callback to make with the id. For
                       compatibility with <O.RemoteQuery>.

        Returns:
            {Number} The index of the id, or -1 if not found.
    */
    indexOfId: function ( id, from, callback ) {
        var record = this.get( 'store' ).getRecord( this.get( 'Type' ), id ),
            index = -1,
            storeKey;

        if ( record.is( READY ) ) {
            storeKey = record.get( 'storeKey' );
            index = this._storeKeys.indexOf( storeKey, from );
        }
        if ( callback ) {
            callback( index );
        }
        return index;
    },

    /**
        Method: O.LiveQuery#getObjectAt

        Returns the record at the index given in the query.

        Parameters:
            index - {Number} The index of the record to return.

        Returns:
            {O.Record} The record at index i in this array.
    */
    getObjectAt: function ( index ) {
        var storeKey = this._storeKeys[ index ],
            record;
        if ( storeKey ) {
            record = this.get( 'store' )
                         .materialiseRecord( storeKey, this.get( 'Type' ) );
        }
        return record;
    },

    /**
        Method: O.LiveQuery#refresh

        Asks the store to refresh the data for the type used in this query.

        Parameters:
            force - {Boolean} (optional) If true, the store will refresh the
                    data even if it thinks it is up to date.

        Returns:
            {O.LiveQuery} Returns self.
    */
    refresh: function ( force ) {
        this.get( 'store' ).fetchAll( this.get( 'Type' ), force );
        return this;
    },

    /**
        Method: O.LiveQuery#storeDidChangeRecords

        Callback made by the store when there are changes that affect the query.
        The query calculate the changes to make and fire any necessary
        observers/events.

        Parameters:
            storeKeysOfChanged - {Array} List of store keys that have changed
                                 which are of the type included in this query.

        Returns:
            {Boolean} Was there a change in the query results?
    */
    storeDidChangeRecords: function ( storeKeysOfChanged ) {
        var filter = this._filter,
            sort = this._sort,
            storeKeys = this._storeKeys,
            added = [], addedIndexes = [],
            removed = [], removedIndexes = [],
            oldLength = this.get( 'length' ),
            store = this.get( 'store' ),
            storeKeyToId = function ( storeKey ) {
                return store.getIdFromStoreKey( storeKey ) ||
                    ( '#' + storeKey );
            },
            i, l, storeKey, index, shouldBeInQuery,
            newStoreKeys, oi, ri, ai, a, b,
            addedLength, removedLength, newLength, maxLength;

        // 1. Find indexes of removed and ids of added
        // If it's changed, it's added to both.
        l = storeKeysOfChanged.length;
        while ( l-- ) {
            storeKey = storeKeysOfChanged[l];
            index = storeKeys.indexOf( storeKey );
            shouldBeInQuery = ( store.getStatus( storeKey ) & READY ) &&
                ( !filter || filter( storeKey ) );
            // If in query
            if ( index > -1 ) {
                // And should be in query
                if ( shouldBeInQuery ) {
                    // If there's a sort
                    if ( sort ) {
                        removedIndexes.push( index );
                        added.push( storeKey );
                    }
                }
                // And shouldn't be in query
                else {
                    removedIndexes.push( index );
                }
            }
            // If not in query
            else {
                // But should be
                if ( shouldBeInQuery ) {
                    added.push( storeKey );
                }
            }
        }

        removedLength = removedIndexes.length;
        addedLength = added.length;

        // 2. Sort removed indexes and find removed ids.
        if ( removedLength ) {
            removedIndexes.sort( numerically );
            for ( i = 0; i < removedLength; i += 1 ) {
                removed[i] = storeKeys[ removedIndexes[i] ];
            }
        }

        // 3. Construct new array of store keys by merging sorted arrays
        if ( addedLength || removedLength ) {
            if ( addedLength && sort ) {
                added.sort( sort );
            }
            newLength = oldLength - removedLength + addedLength;
            newStoreKeys = new Array( newLength );
            for ( i = 0, oi = 0, ri = 0, ai = 0; i < newLength; i += 1 ) {
                while ( ri < removedLength && oi === removedIndexes[ ri ] ) {
                    ri += 1;
                    oi += 1;
                }
                if ( sort && oi < oldLength && ai < addedLength ) {
                    a = storeKeys[ oi ];
                    b = added[ ai ];
                    if ( sort( a, b ) < 0 ) {
                        newStoreKeys[i] = a;
                        oi += 1;
                    } else {
                        newStoreKeys[i] = b;
                        addedIndexes[ ai ] = i;
                        ai += 1;
                    }
                } else if ( oi < oldLength ) {
                    newStoreKeys[i] = storeKeys[ oi ];
                    oi += 1;
                } else {
                    newStoreKeys[i] = added[ ai ];
                    addedIndexes[ ai ] = i;
                    ai += 1;
                }
            }
        }

        // 4. Sort added/addedIndexes arrays by index
        if ( addedLength ) {
            addedIndexes.sort( numerically );
            for ( i = 0; i < addedLength; i += 1 ) {
                added[i] = newStoreKeys[ addedIndexes[i] ];
            }
        }

        // 5. Check if there are any redundant entries in the added/removed
        // lists
        l = Math.min( addedLength, removedLength );
        while ( l-- ) {
            if ( added[l] === removed[l] &&
                    addedIndexes[l] === removedIndexes[l] ) {
                added.splice( l, 1 );
                addedIndexes.splice( l, 1 );
                removed.splice( l, 1 );
                removedIndexes.splice( l, 1 );
                addedLength -= 1;
                removedLength -= 1;
            }
        }

        // 6. If there was an actual change, notify observers.
        if ( addedLength || removedLength ) {
            this._storeKeys = newStoreKeys;
            maxLength = Math.max( newLength, oldLength );
            this.beginPropertyChanges()
                .set( 'length', newLength )
                .rangeDidChange(
                    Math.min(
                        addedLength ? addedIndexes[0] : maxLength,
                        removedLength ? removedIndexes[0] : maxLength
                    ),
                    newLength === oldLength ?
                        Math.max(
                            addedLength ?
                                addedIndexes[ addedLength - 1 ] : 0,
                            removedLength ?
                                removedIndexes[ removedLength - 1 ] : 0
                        ) + 1 :
                        maxLength
                )
                .endPropertyChanges()
                .fire( 'query:updated', {
                    removed: removed.map( storeKeyToId ),
                    removedIndexes: removedIndexes,
                    added: added.map( storeKeyToId ),
                    addedIndexes: addedIndexes
                });
            return true;
        }
        return false;
    },

    /**
        Method: O.LiveQuery#getIdsForObjectsInRange

        Get a callback with an array of the id properties for all objects in the
        range given.

        Parameters:
            start    - {Number} The index of the first object to get an id for.
            end      - {Number} One past the index of the last object to get an
                       id for.
            callback - {Function} This will be called with the array of ids as
                       the first argument, the index of the first returned
                       result as the second argument, and one past the index
                       of the last result as the third argument.

        Returns:
            {Boolean} Always false. Represents whether the data is still loading
            (i.e. whether the callback has yet to be fired).
    */
    getIdsForObjectsInRange: function ( start, end, callback ) {
        start = Math.max( 0, start );
        end = Math.min( this.get( 'length' ), end );
        var store = this.get( 'store' );
        callback( this._storeKeys.slice( start, end )
                                 .map( function ( storeKey ) {
            return store.getIdFromStoreKey( storeKey ) || ( '#' + storeKey );
        }), start, end );
        return false;
    },

    /**
        Method: O.LiveQuery#getIdsForAllObjects

        Get a callback with an array of the id properties for all objects in the
        array.

        Parameters:
            callback - {Function} This will be called with the array of ids as
                       the first argument, the index of the first returned
                       result as the second argument, and one past the index
                       of the last result as the third argument.

        Returns:
            {Boolean} Always false. Represents whether the data is still loading
            (i.e. whether the callback has yet to be fired).
    */
    getIdsForAllObjects: function ( callback ) {
        // 0x7fffffff is the largest positive signed 32-bit number.
        return this.getIdsForObjectsInRange( 0, 0x7fffffff, callback );
    }
});

NS.LiveQuery = LiveQuery;

}( O ) );
