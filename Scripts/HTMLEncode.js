/**
	{
		"api":1,
		"name":"HTML Encode",
		"description":"Encodes HTML entities in your text",
		"author":"See Source",
		"icon":"HTML",
		"tags":"html,encode,web"
	}
**/

const { encode } = require('@flxify/he')

function main(input) {
	input.text = encode(input.text)
}
