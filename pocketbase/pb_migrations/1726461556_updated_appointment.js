/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("0tehb0pkxwcqo5o")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ogerd97l",
    "name": "appointment_doctor",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("0tehb0pkxwcqo5o")

  // update
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ogerd97l",
    "name": "appointmentclinic",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
})
