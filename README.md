## Betfair-node

# An Explaination of this code: #

This code is a great starting point for automated betting on the Betfair api. While it is not complete at the moment, it is useful for those familiar with JavaScript and Typescript as a starting point and contains most of the methods required to place bets on the Betfair api and subscribe to market information using the Exchange Stream API. As of the moment, it can't just be easily imported into a nodejs project like a normal package and I will fix that when time allows. Here is what the code does:

#BetfairApi

This class allows the user to log in (although certificate authentication is not yet supported), create an Exchange Stream call JSON RPC methods and more.

#BetfairExchangeStream

Can be instantiated on its own to subscribe to markets over the exchange stream and receive low latency information about markets, without the need of constantly polling for results.

#BetfairStreamDecoder

Handles the deserialization of incoming JSON packets, and builds a market cache which is updated when deltas are received.

#Heartbeat

Maintains a connection with the server in the specified duration (500ms by default) so that if the server loses connection with you the client, you're notified by the HeartAttack! method.

#Logging

Category logging categories, I use Winston and it works well.

#Request Conflater

Can be useful if you want to subscribe to many markets at the same time from different sources, this class can conflate your requests in a specified window (like 500ms for example). Note that this is different from the reponse conflation parameter which by default is set to 0ms for the fastest deltas.

If anyone has any questions, send me an email @ felixmccuaig@gmail.com
From Felix.