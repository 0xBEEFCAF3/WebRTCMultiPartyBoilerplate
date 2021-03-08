import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import styled from "styled-components";
import { eventNames } from "process";

const Container = styled.div`
    height: 100vh;
    width: 50%;
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
`;

const Messages = styled.div`
    width: 100%;
    height: 60%;
    border: 1px solid black;
    margin-top: 10px;
    overflow: scroll;
`;

const MessageBox = styled.textarea`
    width: 100%;
    height: 30%;
`;

const Button = styled.div`
    width: 50%;
    border: 1px solid black;
    margin-top: 15px;
    height: 5%;
    border-radius: 5px;
    cursor: pointer;
    background-color: black;
    color: white;
    font-size: 18px;
`;

const MyRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
`;

const MyMessage = styled.div`
  width: 45%;
  background-color: blue;
  color: white;
  padding: 10px;
  margin-right: 5px;
  text-align: center;
  border-top-right-radius: 10%;
  border-bottom-right-radius: 10%;
`;

const PartnerRow = styled(MyRow)`
  justify-content: flex-start;
`;

const PartnerMessage = styled.div`
  width: 45%;
  background-color: grey;
  color: white;
  border: 1px solid lightgray;
  padding: 10px;
  margin-left: 5px;
  text-align: center;
  border-top-left-radius: 10%;
  border-bottom-left-radius: 10%;
`;

const Room = (props) => {
    const peersRef = useRef({});
    const sendChannels = useRef({});
    const currentPeer = useRef();
    
    const socketRef = useRef();
    const [myPlayerId, setMyPlayerId]  = useState("");
    const [text, setText] = useState("");
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        socketRef.current = io("http://localhost:3334");
        socketRef.current.emit('joinRoom', {rid: props.match.params.roomID});
        socketRef.current.on('playerJoined', playerId => {
            console.log('new player joiuned', playerId, socketRef.current);
            setMyPlayerId(prevId => String(socketRef.current.id));
            if(socketRef.current.id === playerId) return;
            callUser(playerId);
        });

        socketRef.current.on("createRoom", () => console.log('room created'));
        socketRef.current.on("signal", handelSignal);
        socketRef.current.on("iceCandidate", handleNewICECandidateMsg);
    }, []);


    function callUser(playerId) {
        console.log('calling user', playerId);
        peersRef.current[playerId] = createPeer(playerId);
        sendChannels.current[playerId] = peersRef.current[playerId].createDataChannel("sendChannel");
        sendChannels.current[playerId].onmessage = handleRecieveMessage;
    }

    function handleRecieveMessage(e) {
        setMessages( messages => [...messages, {yours: false, value: e.data}])
    }

    function createPeer(playerId) {
        const peer = new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:stun.stunprotocol.org"
                },
                {
                    urls: 'turn:numb.viagenie.ca',
                    username: 'armins88@gmail.com',
                    credential: 'x3P44pdLjUcjvTR',
                },
               
            ]
        });

        peer.onicecandidate = handleICECandidateEvent;
        peer.playerId = playerId;
        peer.onnegotiationneeded = () => handleNegotiationNeededEvent(playerId);
        peer.onicecandidateerror = (err) => console.error(`Failed to ice with ${peer.playerId}`, err)
        peer.oniceconnectionstatechange = () => {
            console.log(`state change for ${peer.playerId} `,peersRef.current[peer.playerId] );
            if(peersRef.current[playerId] && peersRef.current[playerId].iceConnectionState === 'disconnected') {
                console.log(`${playerId} has disconnected`);
                peersRef.current[playerId] = undefined;
            }
        }

        return peer;
    }

    async function handleNegotiationNeededEvent(playerId) {
        const offer = await peersRef.current[playerId].createOffer();
        await peersRef.current[playerId].setLocalDescription(offer);
        socketRef.current.emit("signal", {targetPlayerId: playerId, rid: props.match.params.roomID, desc: peersRef.current[playerId].localDescription});
    }

    function sendMessage() {
        console.log('SENDING MESSAGES ', sendChannels.current);
        
        for (const [key, sendChannel] of Object.entries(sendChannels.current)) {
            console.log('sending to ' , key);
            
            if(!sendChannel) {
                console.log('data channel has not been set yet');
                continue;
            } else if(sendChannel.readyState !== 'open') {
                console.log('data channel has not been open yet');
                continue; 
            }
            sendChannel.send(text);    
        }
        setMessages(messages => [...messages, {yours: true, value: text}]);
        setText("");
    }


    async function handelSignal(event) {
        console.log('inc event', event.desc.type, 'from', event.playerId, 'for', event.targetPlayerId);
        if(event.targetPlayerId !== socketRef.current.id) return; // Is this signal request, specified for me?
        // if(event.playerId === socketRef.current.id) return;
        if(event.desc.type === 'offer') {
            if(peersRef.current[event.playerId] && peersRef.current[event.playerId].signalingState === 'stable') {
                // If this peer has already negotiated, ingore this offer request
                return;
            }
            // console.log('handel offer', event);
            peersRef.current[event.playerId] = createPeer(event.playerId);
            peersRef.current[event.playerId].ondatachannel = (event) => {
                const targetPlayerId = event.explicitOriginalTarget.playerId;
                console.log("DATA CHANNEL OPENED for target player :", targetPlayerId);
                
                sendChannels.current[targetPlayerId] = event.channel;
                sendChannels.current[targetPlayerId].onmessage = handleRecieveMessage;
                sendChannels.current[targetPlayerId].onerror = (error) => {
                    console.log("Data Channel Error:", error);
                  };
            } 
            await peersRef.current[event.playerId].setRemoteDescription(event.desc);
            const answer = await peersRef.current[event.playerId].createAnswer();
            await peersRef.current[event.playerId].setLocalDescription(answer);
            socketRef.current.emit("signal", {targetPlayerId: event.playerId, rid: props.match.params.roomID, desc: peersRef.current[event.playerId].localDescription})
            console.log('answer for ', event.playerId);
             
        } else if(event.desc.type === 'answer') {
            if( peersRef.current[event.playerId].signalingState === 'stable') {
                // If this peer has already negotiated, ignore this offer request
                return;
            }
            peersRef.current[event.playerId].setRemoteDescription(event.desc).catch(e => console.error(e));
        }
    }

    function handleICECandidateEvent(e) {
        
        const targetPlayerId = e.explicitOriginalTarget.playerId
        console.log('target: ', targetPlayerId, e);
        if (e.candidate) {
            // socketRef.current.emit("iceCandidate", {rid: props.match.params.roomID, candidate: e.candidate});
            socketRef.current.emit("iceCandidateAlt", {targetPlayerId, rid: props.match.params.roomID, candidate: e.candidate});
        }
    }

    function handleNewICECandidateMsg(incoming) {
        // if(!peersRef.current[incoming.playerId] || incoming.playerId === socketRef.current.id ) return;
        if(incoming.targetPlayerId === socketRef.current.id) {
            console.log('new ice from', incoming , incoming.playerId,  peersRef.current);
            const candidate = new RTCIceCandidate(incoming.candidate)
            // candidate.usernameFragment = null;
            peersRef.current[incoming.playerId].addIceCandidate(candidate);
        }
    }

    function handleChange(e) {
        setText(e.target.value);
    }

    function renderMessage(message, index) {
        if (message.yours) {
            return (
                <MyRow key={index}>
                    <MyMessage>
                        {message.value}
                    </MyMessage>
                </MyRow>
            )
        }

        return (
            <PartnerRow key={index}>
                <PartnerMessage>
                    {message.value}
                </PartnerMessage>
            </PartnerRow>
        )
    }

    return (
        <Container>
            <h1>My player Id: {myPlayerId}</h1>
            <Messages>
                {messages.map(renderMessage)}
            </Messages>
            <MessageBox value={text} onChange={handleChange} placeholder="Say something....." />
            <Button onClick={sendMessage}>Send..</Button>
        </Container>
    );
};

export default Room;