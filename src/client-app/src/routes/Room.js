import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import styled from "styled-components";

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
    const peerRef = useRef();
    const socketRef = useRef();
    const otherUser = useRef();
    const sendChannel = useRef();
    const [text, setText] = useState("");
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        socketRef.current = io("http://localhost:3334");
        socketRef.current.emit('joinRoom', {rid: props.match.params.roomID});

        socketRef.current.on('playerJoined', userID => {
            console.log('player joiuned', userID,socketRef.current);
            
            if(socketRef.current.id === userID) return;
            callUser(userID);
            otherUser.current = userID;
        });

        socketRef.current.on("createRoom", () => console.log('room created'));
        socketRef.current.on("signal", handelSignal);
        socketRef.current.on("iceCandidate", handleNewICECandidateMsg);

    }, []);


    function callUser(userID) {
        console.log('calling user', userID);
        
        peerRef.current = createPeer(userID);
        sendChannel.current = peerRef.current.createDataChannel("sendChannel");
        sendChannel.current.onmessage = handleRecieveMessage;
    }

    function handleRecieveMessage(e) {
        setMessages( messages => [...messages, {yours: false, value: e.data}])
    }

    function createPeer(userID) {
        const peer = new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:stun.stunprotocol.org"
                },
                {
                    urls: 'turn:numb.viagenie.ca',
                    credential: 'muazkh',
                    username: 'webrtc@live.com'
                },
            ]
        });

        peer.onicecandidate = handleICECandidateEvent;
        peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

        return peer;
    }

    function handleNegotiationNeededEvent(userID) {
        peerRef.current.createOffer().then(offer => {
            return peerRef.current.setLocalDescription(offer);
        }).then(() => {
            const payload = {
                target: userID,
                caller: socketRef.current.id,
                sdp: peerRef.current.localDescription
            };
            // Send offer
            socketRef.current.emit("signal", {rid: props.match.params.roomID, desc: peerRef.current.localDescription});
        }).catch(e => console.log(e));
    }

    function sendMessage() {
        if(!sendChannel.current) {
            console.log('data channel has not been set yet');
            return;
        }
        sendChannel.current.send(text);
        setMessages(messages => [...messages, {yours: true, value: text}]);
        setText("");
    }


    function handelSignal(event) {
        console.log('inc event', event);
        
        if(event.player === socketRef.current.id) return;
        if(event.desc.type === 'offer') {
            console.log('handel offer', event);
            peerRef.current = createPeer();
            peerRef.current.ondatachannel = (event) => {
                console.log("DATA CHANNEL OPENED", event);
                sendChannel.current = event.channel;
                sendChannel.current.onmessage = handleRecieveMessage;
            }

            // const desc = new RTCSessionDescription(event.desc.sdp);
            peerRef.current.setRemoteDescription(event.desc).then(() => {
            }).then(() => {
                return peerRef.current.createAnswer();
            }).then(answer => {
                return peerRef.current.setLocalDescription(answer);
            }).then(() => {
                socketRef.current.emit("signal", {rid: props.match.params.roomID, desc: peerRef.current.localDescription})
            });
        } else if(event.desc.type === 'answer') {
            console.log('handel answer', event);
            // const desc = new RTCSessionDescription(message.sdp);
            peerRef.current.setRemoteDescription(event.desc).catch(e => console.log(e));
        }
    }

    function handleAnswer(message) {
        console.log('handel answer', message);
        
        const desc = new RTCSessionDescription(message.sdp);
        peerRef.current.setRemoteDescription(desc).catch(e => console.log(e));
    }

    function handleICECandidateEvent(e) {
        console.log('handle ice candidate', e);
        if (e.candidate) {
            const payload = {
                target: otherUser.current,
                candidate: e.candidate,
            }
            socketRef.current.emit("iceCandidate", {rid: props.match.params.roomID, candidate: e.candidate});
        }
    }

    function handleNewICECandidateMsg(incoming) {
        console.log('new ice candidates', incoming);
        
        const candidate = new RTCIceCandidate(incoming.candidate)
        peerRef.current.addIceCandidate(candidate)
            .catch(e => console.log(e));
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
            <Messages>
                {messages.map(renderMessage)}
            </Messages>
            <MessageBox value={text} onChange={handleChange} placeholder="Say something....." />
            <Button onClick={sendMessage}>Send..</Button>
        </Container>
    );
};

export default Room;