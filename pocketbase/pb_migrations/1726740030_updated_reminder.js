/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("8p9mvi0i2npi4a2")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "l0cxv3an",
    "name": "location",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "0tehb0pkxwcqo5o",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "pro8feio",
    "name": "doctor_name",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "0tehb0pkxwcqo5o",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ihv44k8f",
    "name": "datetime",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "0tehb0pkxwcqo5o",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("8p9mvi0i2npi4a2")

  // remove
  collection.schema.removeField("l0cxv3an")

  // remove
  collection.schema.removeField("pro8feio")

  // remove
  collection.schema.removeField("ihv44k8f")

  return dao.saveCollection(collection)
})
