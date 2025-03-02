/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oyiktpintzaqf6n")

  // remove
  collection.schema.removeField("ukloixwm")

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oyiktpintzaqf6n")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ukloixwm",
    "name": "password",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  return dao.saveCollection(collection)
})
