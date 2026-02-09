/// <reference no-default-lib="true"/>
/// <reference lib="es5" />

// Basic PocketBase JSVM type definitions
// Based on PocketBase documentation

declare namespace pb {
    interface App {
        dao(): Dao;
        // Add other methods as needed
    }

    interface Dao {
        findRecordById(collection: string, id: string): Record;
        findRecordsByFilter(collection: string, filter: string, sort: string, limit: number, offset: number): Record[];
        saveRecord(record: Record): void;
        deleteRecord(record: Record): void;
    }

    interface Record {
        id: string;
        created: string;
        updated: string;
        collectionId: string;
        collectionName: string;
        get(key: string): any;
        set(key: string, value: any): void;
        // ...
    }

    interface Context {
        json(status: number, data: any): void;
        // ...
    }

    interface Event {
        httpContext: any; // Simplified
        record: Record;
    }
}

declare const $app: pb.App;
declare const $os: any;
declare const $http: any;
declare const $security: any;
declare const $apis: any;

declare function routerAdd(method: string, path: string, handler: (c: any) => any): void;
declare function onRecordBeforeCreateRequest(handler: (e: any) => any, ...collections: string[]): void;
// Add other hooks as needed
