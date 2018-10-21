import React from "react";

const Form = props => (
	<form onSubmit={props.getWeather}>
		<input type="text" name="city" placeholder="City..."/>
		<input type="text" name="country" placeholder="Country..."/>
		<button>Get Weather</button>
		<a style={{display: "table-cell"}} href="http://193.159.244.134:80" target="_blank">Preview Camera</a>
	</form>
);

export default Form;