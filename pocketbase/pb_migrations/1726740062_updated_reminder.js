/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("8p9mvi0i2npi4a2")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "r25salzy",
    "name": "reason",
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
  collection.schema.removeField("r25salzy")

  return dao.saveCollection(collection)
})
