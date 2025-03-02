/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oyiktpintzaqf6n")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ojmxvsvc",
    "name": "uniquepassword",
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
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("oyiktpintzaqf6n")

  // remove
  collection.schema.removeField("ojmxvsvc")

  return dao.saveCollection(collection)
})
