import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import * as FaIcons from "react-icons/fa";
import { CiLocationArrow1 } from "react-icons/ci";
import { FiRefreshCcw, FiMaximize2 } from "react-icons/fi";
import { IoClose } from "react-icons/io5";
import { IoMdApps } from "react-icons/io";
import "./styles/agent.css"
import { motion, AnimatePresence } from "framer-motion";
import Markdown from 'react-markdown'
import { Settings } from './settings';
import { AuthPopup } from '../components/AuthPopup';
import supabase from '../supabase';
import Login from "../components/googleSignIn";
import { AppNotAvailablePopup, ConnectAppPopup } from '../components/ConnectAppPopup';
import { Apps } from '../components/apps';
import { allApps } from "../components/allApps";
import { ImFilesEmpty } from "react-icons/im";
import { Files } from "../components/files";
import { Content } from "../components/content";
import { HowToUse } from "../components/howToUse";
import { FacingBugs } from "../components/facingBugs";
import { MdPermMedia } from "react-icons/md";
import { FaSterlingSign } from "react-icons/fa6";
import { MdArticle } from "react-icons/md";


export const AgentVoice = ({ userData, jobs, setJobs, selectedJob, setSelectedJob, connectedApps, setConnectedApps, nonConnectedApps, setNonConnectedApps }) => {
    const { id } = useParams();
    const [socket, setSocket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageImages, setMessageImages] = useState([]);
    const [cleanMessages, setCleanMessages] = useState([]);
    
    const [inputMessage, setInputMessage] = useState("");
    // const [attachedImages, setAttachedImages] = useState([]); // Comment out or remove
    const [attachedDocuments, setAttachedDocuments] = useState([]);
    const [attachedImages, setAttachedImages] = useState([]);
    const [isWaiting, setIsWaiting] = useState(false);

    const location = window.location.href;
    const segments = location.split('/');
    const jobIdFromURL = parseInt(segments[3]);
    const [jobId, setJobId] = useState(jobIdFromURL || null);

    // Text-to-speech state
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [currentAudio, setCurrentAudio] = useState(null);
    const processedMessagesRef = useRef(new Set());

    // Ensure we only sync the jobId from the URL to selectedJob once (on mount) to avoid render-time updates
    useEffect(() => {
        if (jobIdFromURL) {
            setSelectedJob(jobIdFromURL);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const messagesContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const [browsingURL, setBrowsingURL] = useState(null);
    const [isPopupMinimized, setIsPopupMinimized] = useState(false);
    const [popupPosition, setPopupPosition] = useState({ x: 100, y: 100 });

    const [isSearching, setIsSearching] = useState(false);
    const [searchingLogos, setSearchingLogos] = useState([]);

    const [activeActions, setActiveActions] = useState([]);

    const inputRef = useRef(null);

    const [showBrowsingPopup, setShowBrowsingPopup] = useState(false);
    const browsingActionRef = useRef(null);
    const [browsingActionRect, setBrowsingActionRect] = useState(null);

    const [showSettings, setShowSettings] = useState(false);
    const [showAuthPopup, setShowAuthPopup] = useState(false);


    const [agentDidntReply, setAgentDidntReply] = useState(false);

    const [user, setUser] = useState(null);
    const userRef = useRef(null);
    const lastMessageTypeRef = useRef('agent');

    const [isRecording, setIsRecording] = useState(false);
    const currentInputMessageRef = useRef('');

    const [sentFirstMessage, setSentFirstMessage] = useState(false);

    const [showConnectAppPopup, setShowConnectAppPopup] = useState(false);
    const [appToConnect, setAppToConnect] = useState(null);

    // handling the app not available popup
    const [showAppNotAvailablePopup, setShowAppNotAvailablePopup] = useState(false);
    const [appNotAvailable, setAppNotAvailable] = useState(null);

    const [realtimeChannel, setRealtimeChannel] = useState(null);
    const [subscriptionStatus, setSubscriptionStatus] = useState('disconnected');

    useEffect(() => {
        const getUser = async () => {
            const {
                data: { user },
                error,
            } = await supabase.auth.getUser();

            if (user) {
                console.log("USER: ", user);
                setUser(user);
                userRef.current = user;
            } else if (error) {
                console.error('Error fetching user:', error.message);
            }
        };

        getUser();
    }, []);


    const refreshFiles = async () => {

        console.log("Refreshing files");
        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('user_id', user.id);

        if (data) {
            console.log("Files: ", data);
            setFiles(data);
        }

        const { data: images, error: imagesError } = await supabase
            .from('images')
            .select('*')
            .eq('user_id', user.id);

        if (images) {
            console.log("Images: ", images);
            setImages(images);  
        }

        for (const image of images) {
            if (imageUrls[image.id]) {
                continue;
            }

            const response = await fetch('https://api.saidar.ai/get_file', {
            // const response = await fetch('http://localhost:5050/get_file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: image.filename,
                    user_id: userData.user_id
                })
            });

            if (!response.ok) {
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errData = await response.json();
                    errorMsg = errData.error || `Server error: ${response.statusText}`;
                } catch (e) { /* Ignore */ }
                throw new Error(`Failed to get file URL: ${errorMsg}`);
            }

            const data = await response.json();
            const s3Url = data.file_url;
            setImageUrls(prev => ({ ...prev, [image.id]: s3Url }));
        }
    }

    useEffect(() => {
        if (messages.length > 0) {
            // set the messages to the job
            setJobs(prev => {
                return prev.map(job => {
                    if (job.id === jobId) {
                        return {
                            ...job,
                            conversation: messages
                        };
                    }
                    return job;
                });
            });
        }

        if (messagesContainerRef.current) {
            const { scrollTop, clientHeight, scrollHeight } = messagesContainerRef.current.children[0];
            // If the bottom is not visible, scroll to bottom
            if (scrollTop + clientHeight < scrollHeight) {
                messagesContainerRef.current.children[0].scrollTop = scrollHeight;
            }
        }


        const newImages = [];
        // const newCleanMessages = messages.slice();
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === 'assistant') {
                const message = messages[i].content;
                if (message) {
                    if (message.includes('<image>')) {
                        const filename = message.split('<image>')[1].split('</image>')[0].trim();
                        const message_index = i;
                        const image = {
                            filename: filename,
                            message_index: message_index,
                        }
                        newImages.push(image);
                    }
                }
            }
        }

        newImages.forEach(async (image) => {
            // console.log("Image: ", image);
            // if (image.filename.includes("http")) {
            //     const image_id = images.find(img => img.filename === image.filename).id;
            //     if (imageUrls[image_id]) {
            //         image.url = imageUrls[image_id];
            //         return;
            //     }
            // }

            console.log("Image: ", image);
            console.log("Images: ", images);
            if (images.find(img => img.filename === image.filename)) {
                const image_id = images.find(img => img.filename === image.filename).id;
                console.log("Image in images");
                if (imageUrls[image_id]) {
                    image.url = imageUrls[image_id];
                    return;
                }
            }

            const response = await fetch('https://api.saidar.ai/get_file', {
            // const response = await fetch('http://localhost:5050/get_file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: image.filename,
                    user_id: userData.user_id
                })
            });

            console.log("Response: ", response);

            if (!response.ok) {
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errData = await response.json();
                    errorMsg = errData.error || `Server error: ${response.statusText}`;
                } catch (e) { /* Ignore */ 
                    console.error("Error getting file:", errorMsg);
                }
            }

            const data = await response.json();
            const s3Url = data.file_url;
            setImageUrls(prev => ({ ...prev, [image.id]: s3Url }));
            image.url = s3Url;
        })
        setMessageImages(newImages);
        console.log("Images: ", newImages);
        
    }, [messages]);

    // Text-to-speech effect for new assistant messages
    useEffect(() => {
        const processAssistantMessages = async () => {
            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                
                // Check if this is an assistant message we haven't processed yet
                if (message.role === 'assistant' && 
                    message.content && 
                    !processedMessagesRef.current.has(i)) {
                    
                    console.log("New assistant message detected, converting to speech:", message.content);
                    
                    // Mark this message as processed
                    processedMessagesRef.current.add(i);
                    
                    // Convert text to speech and play
                    const audioUrl = await convertTextToSpeech(message.content);
                    if (audioUrl) {
                        await playAudio(audioUrl);
                    }
                    
                    // Only process one message at a time to avoid overlapping audio
                    break;
                }
            }
        };

        if (messages.length > 0) {
            processAssistantMessages();
        }
    }, [messages]);

    // Clean up processed messages when messages array changes significantly
    useEffect(() => {
        if (messages.length === 0) {
            processedMessagesRef.current.clear();
        }
    }, [messages.length]);

    useEffect(() => {
        if (selectedJob) {
            console.log("Selected job: ", selectedJob, "Jobs: ", jobs);
            const job = jobs.find(job => job.id === selectedJob);
            if (job) {
                setJobId(job.id);
                console.log("Job: ", job);
                setMessages(job.conversation || []);

                setInputMessage(job.input_message || '');
            }
        } else {
            const location = window.location.href;
            const segments = location.split('/');
            const job_id = parseInt(segments[3]);
            console.log("Job ID: ", job_id);
            console.log("User: ", user);
            if (!job_id && user) { // this is only if you log in right after creating a job. otherwise no need to get the old messages

                const input_message = localStorage.getItem('input_message');
                const message = localStorage.getItem('message');
                const job_id = localStorage.getItem('job_id');
                const job_title = localStorage.getItem('job_title');
                const messages = JSON.parse(localStorage.getItem('messages'));
                const selected_job = localStorage.getItem('selected_job');
                const jobs = JSON.parse(localStorage.getItem('jobs'));

                if (job_id) {
                    setJobId(job_id);
                    setSelectedJob(job_id);

                    console.log("User: ", user);
                    console.log("User ID: ", user.id);
                    console.log("Job ID: ", job_id);
                    supabase.from('jobs').update({ user_id: user.id }).eq('id', job_id).then(() => {
                        console.log("Job updated");
                    });

                    if (messages && messages.length > 0) {
                        setMessages(messages);
                    }

                    if (jobs && jobs.length > 0) {
                        console.log("Setting jobs: ", jobs);
                        setJobs(jobs);
                        jobs.forEach(job => {
                            supabase.from('jobs').update({ user_id: user.id }).eq('id', job.id);
                        });
                    }

                    localStorage.removeItem('job_id');
                    localStorage.removeItem('job_title');
                    localStorage.removeItem('messages');
                    localStorage.removeItem('selected_job');
                    localStorage.removeItem('jobs');
                } else {
                    setJobId(null);
                    setMessages([]);
                    setMessageImages([]);
                }
                // check if there is an input message in local storage
                console.log("Message: ", message);
                console.log("Job ID: ", job_id);
                console.log("Job Title: ", job_title);
                console.log("Messages: ", messages);
                console.log("Selected Job: ", selected_job);
                console.log("Jobs: ", jobs);
                console.log("Message: ", message);
                if (input_message) {
                    setInputMessage(input_message);
                    localStorage.removeItem('input_message');
                } else {
                    setInputMessage('');
                }
            } else if (!job_id) {
                setJobId(null);
                setMessages([]);
                setMessageImages([]);
            }
        }
    }, [selectedJob, user]);

    useEffect(() => {
        if (jobId) {
            const job = jobs.find(job => job.id === jobId);
            if (job && messages.length === 0) {
                setMessages(job.conversation || []);

                if (job.input_message && inputMessage === '') {
                    setInputMessage(job.input_message);
                }
            }
        }
    }, [jobId, jobs]);

    useEffect(() => {
        if (jobId) {
            setupRealtimeSubscription(jobId);
        }
        
        // Clean up subscription when unmounting or changing jobId
        return () => {
            if (realtimeChannel) {
                console.log("Cleaning up realtime subscription on unmount");
                realtimeChannel.unsubscribe();
                setRealtimeChannel(null);
                setSubscriptionStatus('disconnected');
            }
        };
    }, [jobId]);

    const handleBrowsingClick = () => {

        console.log("Browsing action clicked", browsingURL, browsingActionRef.current);
        if (browsingActionRef.current) {
            const rect = browsingActionRef.current.getBoundingClientRect();
            setBrowsingActionRect(rect);
            setShowBrowsingPopup(true);
        }
    };

    useEffect(() => {
        const handleMessage = (event) => {
            if (event.data === "browserbase-disconnected") {
                console.log("Browser disconnected");
                setShowBrowsingPopup(false);
            }
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);
    const generateTitle = async (input, job_id) => {
        try {
            const response = await fetch('https://api.saidar.ai/generate_title', {
            // const response = await fetch('http://localhost:5050/generate_title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ input }),
            });

            console.log("Generate title response: ", response);

            const data = await response.json();
            console.log(data);

            const { title } = data;

            try {
                const { data: updatedJob, error } = await supabase
                    .from('jobs')
                    .update({ title })
                    .eq('id', job_id);

                console.log('Title updated successfully');
                setJobs(prev => prev.map(job => job.id === job_id ? { ...job, title } : job));
                return title;
            } catch (error) {
                console.error('Error updating title:', error);
            }
        } catch (error) {
            console.error('Error generating title:', error);
        }
    };

    // Text-to-speech functions
    const convertTextToSpeech = async (text) => {
        try {
            // Clean the text - remove images tags and other formatting
            const cleanText = text
                .replace(/<image>.*?<\/image>/g, '') // Remove image tags
                .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown
                .replace(/\*(.*?)\*/g, '$1') // Remove italic markdown
                .replace(/`(.*?)`/g, '$1') // Remove code markdown
                .replace(/#{1,6}\s/g, '') // Remove heading markdown
                .replace(/\n\n/g, ' ') // Replace double newlines with space
                .replace(/\n/g, ' ') // Replace single newlines with space
                .trim();

            if (!cleanText || cleanText.length === 0) {
                console.log("No text to convert to speech");
                return null;
            }

            console.log("Converting text to speech:", cleanText);

            // Call your backend to convert text to speech using ElevenLabs
            // const response = await fetch('https://api.saidar.ai/text_to_speech', {
            const response = await fetch('http://localhost:5050/text_to_speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: cleanText,
                    voice_id: "TX3LPaxmHKxFdv7VOQHJ", // Default ElevenLabs voice
                    model_id: "eleven_flash_v2_5"
                }),
            });

            if (!response.ok) {
                throw new Error(`TTS API error: ${response.status}`);
            }

            // Get the audio blob from the response
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            
            return audioUrl;
        } catch (error) {
            console.error('Error converting text to speech:', error);
            return null;
        }
    };

    const playAudio = async (audioUrl) => {
        try {
            // Stop any currently playing audio
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }

            const audio = new Audio(audioUrl);
            setCurrentAudio(audio);
            setIsSpeaking(true);

            audio.onended = () => {
                setIsSpeaking(false);
                setCurrentAudio(null);
                URL.revokeObjectURL(audioUrl); // Clean up the URL
            };

            audio.onerror = (error) => {
                console.error('Audio playback error:', error);
                setIsSpeaking(false);
                setCurrentAudio(null);
                URL.revokeObjectURL(audioUrl);
            };

            await audio.play();
        } catch (error) {
            console.error('Error playing audio:', error);
            setIsSpeaking(false);
            setCurrentAudio(null);
        }
    };

    const stopAudio = () => {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            setIsSpeaking(false);
            setCurrentAudio(null);
        }
    };

    const initializeJob = async (input) => {
        if (!jobId) {
            const { data, error } = await supabase
                .from('jobs')
                .insert([
                    {
                        user_id: user?.id,
                        conversation: [
                            {
                                content: input,
                                role: 'user',
                            }
                        ],
                        title: "Untitled"
                    }
                ])
                .select();
            if (error) {
                console.error('Error creating job:', error);
                return;
            }
            setJobs(prev => [...prev, { ...data[0]}]);
            setJobId(data[0].id);
            setSelectedJob(data[0].id);

            generateTitle(input, data[0].id);

            return data[0].id;
        }
    };

    const [isProcessing, setIsProcessing] = useState(false);

    const setupRealtimeSubscription = async (job_id) => {
        // Clean up any existing subscription first
        if (realtimeChannel) {
            console.log("Cleaning up existing subscription");
            realtimeChannel.unsubscribe();
            setSubscriptionStatus('disconnected');
        }

        console.log("Setting up realtime subscription for job:", job_id);
        setSubscriptionStatus('connecting');
        
        try {
            const channel = supabase
                .channel('schema-db-changes')
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'jobs',
                        filter: `id=eq.${job_id}`
                    },
                    (payload) => {
                        console.log("Job updated:", payload);
                        setMessages(payload.new.conversation);
                    }
                )
                .on('system', ({ event }) => {
                    console.log("Supabase system event:", event);
                    if (event === 'SUBSCRIBED') {
                        console.log("Successfully subscribed to realtime updates");
                        setSubscriptionStatus('connected');
                    }
                })
                .on('error', (error) => {
                    console.error("Supabase realtime error:", error);
                    setSubscriptionStatus('error');
                    // Attempt to reconnect after a delay
                    setTimeout(() => {
                        if (realtimeChannel) {
                            console.log("Attempting to reconnect...");
                            realtimeChannel.subscribe();
                        }
                    }, 5000);
                })
                .on('disconnect', () => {
                    console.log("Supabase realtime disconnected");
                    setSubscriptionStatus('disconnected');
                    // Attempt to reconnect after a delay
                    setTimeout(() => {
                        if (realtimeChannel) {
                            console.log("Attempting to reconnect after disconnect...");
                            realtimeChannel.subscribe();
                        }
                    }, 5000);
                });

            const subscription = await channel.subscribe();
            console.log("Subscription result:", subscription);
            setRealtimeChannel(channel);
        } catch (error) {
            console.error("Error setting up realtime subscription:", error);
            setSubscriptionStatus('error');
            // Attempt to reconnect after a delay
            setTimeout(() => {
                setupRealtimeSubscription(job_id);
            }, 5000);
        }
    }

    // Track the last message index we've handled to prevent infinite loops / repeated processing
    const lastHandledProblemIndexRef = useRef(-1);

    useEffect(() => {
        const lastIndex = messages.length - 1;
        if (lastIndex < 0) return;

        // Avoid reprocessing the same message repeatedly
        if (lastHandledProblemIndexRef.current === lastIndex) return;

        const lastMsg = messages[lastIndex];
        console.log("lastMsg: ", lastMsg);
        if (lastMsg && (lastMsg.type === 'app_not_connected' || lastMsg.type === 'app_not_available')) {
            lastHandledProblemIndexRef.current = lastIndex; // mark as handled

            const lastUserMessageIndex = messages.map(msg => msg.role).lastIndexOf('user');
            const input_message = lastUserMessageIndex !== -1 ? messages[lastUserMessageIndex].content : '';

            console.log('Handling app connection issue', lastMsg, input_message);

            // Prepare updated conversation without the problematic assistant message + everything after the user message
            const updatedMessages = lastUserMessageIndex !== -1 ? messages.slice(0, lastUserMessageIndex) : [];

            if (updatedMessages.length === 0) {
                supabase.from('jobs').delete().eq('id', jobId).then(() => {
                    setJobs(prevJobs => prevJobs.filter(job => job.id !== jobId));
                    setSelectedJob(null);
                });
            } else {
                supabase.from('jobs').update({ conversation: updatedMessages }).eq('id', jobId);
            }

            // Update local state and UI once
            setMessages(updatedMessages);
            setInputMessage(input_message);
            localStorage.setItem('input_message', input_message);

            if (lastMsg.type === 'app_not_connected') {
                setAppToConnect(lastMsg.app);
                setShowConnectAppPopup(true);
            } else {
                setAppNotAvailable(lastMsg.app);
                setShowAppNotAvailablePopup(true);
            }
        }
        else if (lastMsg.type === 'processing_complete') {
            setIsProcessing(false);
            console.log("processing complete", "time: ", new Date().toISOString());
            const updatedMessages = messages.slice(0, -1);
            setMessages(updatedMessages);
            supabase.from('jobs').update({ conversation: updatedMessages }).eq('id', jobId);
        } 
    }, [messages, jobId]); // Add jobId to dependencies

    useEffect(() => {
        if (!user && messages.length > 0) {
            localStorage.setItem('job_id', jobId);
            localStorage.setItem('messages', JSON.stringify(messages));
            localStorage.setItem('selected_job', selectedJob);
            localStorage.setItem('jobs', JSON.stringify(jobs));
        }
    }, [messages]);

    const handleConnectApp = async (app = null) => {
        console.log("Connecting app: ");
        if (!user) {
            setShowConnectAppPopup(false);
            setShowAuthPopup(true);
            return;
        }
        try 
        {
            setShowApps(true);
        } catch (error) {
            console.error('Error connecting app:', error);
        }
    };

    const formatAppName = (app) => {
        if (app == "googlecalendar" || app == "google_calendar") {
            return "Google Calendar";
        }
        if (app == "googledocs" || app == "google_docs") {
            return "Google Docs";
        }
        if (app == "googlesheets" || app == "google_sheets") {
            return "Google Sheets";
        }
        if (app == "googleslides" || app == "google_slides") {
            return "Google Slides";
        }
        if (app == "google_tasks") {
            return "Google Tasks";
        }
        if (app == "salesforce_rest_api") {
            return "Salesforce";
        }
        return app.charAt(0).toUpperCase() + app.slice(1);
    };


    // handling the variables for apps
    const [showApps, setShowApps] = useState(false);


    // handling sharing
    const [isSharing, setIsSharing] = useState(false);
    const handleShare = () => {
        setIsSharing(true);

        // copy something to clipboard
        navigator.clipboard.writeText(window.location.origin + "/share/" + userData.id + "/" + jobId);

        setTimeout(() => {
            setIsSharing(false);
        }, 1500);

        (async () => {
            try {
                const { data: shareData } = await supabase.from('globals').select('share').eq('id', 0).single();
                const shareCount = shareData.share + 1;
                const result = await supabase.from('globals').update({ share: shareCount }).eq('id', 0);
            } catch (error) {
                console.error('Error updating share count:', error);
            }
        })();
    }

    const openFileDialog = () => {
        if (fileInputRef.current) {
            // Reset the value so selecting the same file again triggers onChange
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const getFiles = async () => {
        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('user_id', userData.user_id);
        setFiles(data);
    }

    const [imageUrls, setImageUrls] = useState({});

    const getImages = async () => {
        const { data, error } = await supabase
            .from('images')
            .select('*')
            .eq('user_id', userData.user_id);
        setImages(data);

        for (const image of data) {
            if (imageUrls[image.id]) {
                continue;
            }

            const response = await fetch('https://api.saidar.ai/get_file', {
            // const response = await fetch('http://localhost:5050/get_file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: image.filename,
                    user_id: userData.user_id
                })
            });

            if (!response.ok) {
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errData = await response.json();
                    errorMsg = errData.error || `Server error: ${response.statusText}`;
                } catch (e) { /* Ignore */ }
                throw new Error(`Failed to get file URL: ${errorMsg}`);
            }

            const data = await response.json();
            const s3Url = data.file_url;
            setImageUrls(prev => ({ ...prev, [image.id]: s3Url }));
        }
    }

    const [showFiles, setShowFiles] = useState(false);
    useEffect(() => {
        if (userData?.user_id) {
            getFiles();
            getImages();
        }
    }, [userData]);

    const [files, setFiles] = useState(userData?.files);
    const [images, setImages] = useState(userData?.images);

    // Content management state
    const [showContent, setShowContent] = useState(false);
    const [contents, setContents] = useState([]);

    // Get contents from database
    const getContents = async () => {
        if (!userData?.user_id) return;
        
        try {
            const { data: contentsData, error } = await supabase
                .from('contents')
                .select('*')
                .eq('user_id', userData.user_id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Error fetching contents:", error);
            } else {
                setContents(contentsData || []);
            }
        } catch (error) {
            console.error("Error fetching contents:", error);
        }
    };

    // Refresh contents function
    const refreshContents = () => {
        getContents();
    };

    useEffect(() => {
        if (userData?.user_id) {
            getContents();
        }
    }, [userData]);

    const openHowToUse = async() => {
        const { data: howtouseData } = await supabase.from('globals').select('how_to_use').eq('id', 0).single();
        console.log("howtouseData: ", howtouseData.how_to_use);
        const howtouse = howtouseData.how_to_use + 1;
        console.log("howtouse: ", howtouse);
        const result = await supabase.from('globals').update({ how_to_use: howtouse }).eq('id', 0);
        console.log("howtouse: ", result);
    }
    
    // Periodically check connection status and reconnect if needed
    useEffect(() => {
        const checkConnectionInterval = setInterval(() => {
            if (subscriptionStatus !== 'connected' && jobId && !realtimeChannel) {
                console.log("Connection check: attempting to reconnect...");
                setupRealtimeSubscription(jobId);
            }
        }, 30000); // Check every 30 seconds
        
        return () => clearInterval(checkConnectionInterval);
    }, [subscriptionStatus, jobId, realtimeChannel]);

    useEffect(() => {
        if (user && id && jobs && messages.length === 0 && jobId === null) {
            // Find the job with matching id
            const job = jobs.find(job => job.id === id);
            if (job) {
                // Load the job data
                setJobId(job.id);
                setMessages(job.messages || []);
                if (job.input_message) {
                    setInputMessage(job.input_message);
                }
            }
        } else if (user) {
            // get all messages from local storage
            const message = localStorage.getItem('message');
            console.log("Message: ", message);
            if (message) {
                setInputMessage(message);
            }

            // clear local storage
            localStorage.removeItem('message');
            setShowAuthPopup(false);
        }
    }, [user, id, jobs]);

    useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };

        document.addEventListener('keydown', handleKeyPress);
        return () => document.removeEventListener('keydown', handleKeyPress);
    }, []);

    const handleFileUpload = (event) => {
        console.log("handleFileUpload: ", event);
        const files = Array.from(event.target.files);
        const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']; // Comment out or remove
        const documentTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'text/csv']; // Added txt, csv
        
        const validImages = files.filter(file => imageTypes.includes(file.type)); // Comment out or remove
        const validDocuments = files.filter(file => documentTypes.includes(file.type));

        console.log("validDocuments: ", validDocuments);
        
        if (validImages.length + validDocuments.length !== files.length) { // Adjusted condition
            alert('Please upload valid documents.'); // Updated alert
        }

        // Process images - Comment out or remove this entire block
        Promise.all(validImages.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve({ data: e.target.result, type: 'image', name: file.name });
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        })).then(results => {
            setAttachedImages(prevImages => [...prevImages, ...results]);
        });

        // Process documents
        Promise.all(validDocuments.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve({ data: e.target.result, type: 'document', name: file.name });
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        })).then(results => {
            setAttachedDocuments(prevDocs => [...prevDocs, ...results]);
        });
    };

    const removeAttachedImage = (index) => { // Comment out or remove
        setAttachedImages(prevImages => prevImages.filter((_, i) => i !== index));
    };

    const removeAttachedDocument = (index) => {
        setAttachedDocuments(prevDocs => prevDocs.filter((_, i) => i !== index));
    };

    const [firstMessage, setFirstMessage] = useState(true);

    // Update sendMessage to use socketRef
    const sendMessage = async (input_message = null) => {

        console.log("Sending message: ", inputMessage);

        if (!input_message) {
            input_message = inputMessage;
        }

        if (input_message.trim() !== '' || attachedImages.length > 0 || attachedDocuments.length > 0) { // Adjusted condition

            if (!userRef.current && !firstMessage) { // what if we restrict this to the SECOND message, not the first
                localStorage.setItem('message', input_message.trim());  
                localStorage.setItem('job_id', jobId);
                localStorage.setItem('messages', JSON.stringify(messages));
                localStorage.setItem('selected_job', selectedJob);
                localStorage.setItem('jobs', JSON.stringify(jobs));
                // messages and job title
                setShowAuthPopup(true);
                return;
            }

            if (firstMessage) {
                setFirstMessage(false);
            }

            const newMessage = {
                content: input_message.trim(),
                role: 'user',
            };
            
            setMessages(prev => [...prev, newMessage]);
            setIsWaiting(true);
            setAgentDidntReply(false);
            setInputMessage("");

            if (!sentFirstMessage) {
                setSentFirstMessage(true);
            }

            var curr_job_id = jobId;

            if (attachedDocuments.length > 0) {
                setIsProcessing(true);
                setAttachedDocuments([]);
            }

            if (attachedImages.length > 0) {
                setIsProcessing(true);
                setAttachedImages([]);
            }

            if (!curr_job_id) {
                curr_job_id = await initializeJob(newMessage.content);
            } else {
                const update = await supabase
                    .from('jobs')
                    .update({
                        conversation: [...messages, newMessage]
                    })
                    .eq('id', curr_job_id)
                    .single();

                console.log(update)
            }

            console.log("Sending message to job_id: ", curr_job_id);

            console.log("user: ", userRef.current?.id);

            lastMessageTypeRef.current = 'user';

            // fetch('https://api.saidar.ai/send_message_interaction', {
            fetch('http://localhost:5050/send_message_interaction', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    input: newMessage.content,
                    conversation: [...messages, newMessage],
                    job_id: curr_job_id,
                    user_id: userRef.current?.id,
                    all_apps: allApps,
                    timezone: new Date().getTimezoneOffset(),
                    documents: attachedDocuments,
                    images: attachedImages,
                }),
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            }).then(data => {
                if (data.type === "app_not_connected" || data.type === "app_not_available") {
                    const lastUserMessageIndex = messages.map(msg => msg.role).lastIndexOf('user');
                    setMessages(prevMessages => {
                        const updatedMessages = lastUserMessageIndex !== -1 ? prevMessages.slice(0, lastUserMessageIndex) : [];
                        
                        if (updatedMessages.length === 0) {
                            supabase.from('jobs').delete().eq('id', curr_job_id).then(() => {
                                setJobs(prevJobs => prevJobs.filter(job => job.id !== curr_job_id));
                                setSelectedJob(null);
                            });
                        } else {
                            supabase.from('jobs').update({ conversation: updatedMessages }).eq('id', curr_job_id);
                        }
                        
                        return updatedMessages;
                    });

                    const input_message = updatedMessages[lastUserMessageIndex].content;
                    setInputMessage(input_message);
                    console.log("App not connected: ", data.app, "input_message: ", input_message);

                    localStorage.setItem('input_message', input_message);
                    
                    if (data.type === "app_not_connected") {
                        setAppToConnect(data.app);
                        setShowConnectAppPopup(true);
                    } else {
                        setAppNotAvailable(data.app);
                        setShowAppNotAvailablePopup(true);
                    }
                }
            }).catch(error => {
                console.error('Fetch error:', error.message);
                setIsWaiting(false);
            });

           
            
            setIsSearching(false);
            setSearchingLogos([]);
            setAttachedDocuments([]);
            setAttachedImages([]);
        }
    };


    const handleKeyPress = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };



    // HANDLE MICROPHONE HERE

    const startMicrophone = async () => {
        // Toggle recording state if already recording
        if (isRecording) {
            if (window.stopRecording) {
                window.stopRecording();
            }
            return;
        }

        const dg_key = await fetch('https://api.saidar.ai/get_dg_key', {
        // const dg_key = await fetch('http://localhost:5050/get_dg_key', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log("DG Key: ", dg_key);

        let mediaRecorder;
        let audioStream;

        try {
            // Get user media
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Microphone stream obtained:", audioStream);
            
            if (!MediaRecorder.isTypeSupported('audio/webm')) {
                return alert('Browser not supported for audio recording');
            }
            
            mediaRecorder = new MediaRecorder(audioStream, {
                mimeType: 'audio/webm',
            });
            
            // Extract the API key from the response
            const dgKeyResponse = await dg_key.json();
            const dgKeyValue = dgKeyResponse.key || dgKeyResponse;
            
            // Create WebSocket connection to Deepgram
            const socket = new WebSocket('wss://api.deepgram.com/v1/listen', [
                'token',
                dgKeyValue,
            ]);
            
            socket.onopen = () => {
                console.log("Deepgram WebSocket opened");
                
                // Update recording state
                setIsRecording(true);
                
                // Listen for audio data and send to Deepgram
                mediaRecorder.addEventListener('dataavailable', event => {
                    if (event.data.size > 0 && socket.readyState === 1) {
                        socket.send(event.data);
                    }
                });
                
                // Start recording
                mediaRecorder.start(1000);
                console.log("Started recording audio");
            };
            
            socket.onmessage = (message) => {
                try {
                    const received = JSON.parse(message.data);
                    const transcript = received.channel?.alternatives[0]?.transcript;
                    console.log("Received: ", received);
                    
                    if (transcript && transcript.trim() !== '') {
                        // Use the ref value to ensure we have the latest inputMessage value
                        console.log("Transcript: ", transcript);
                        sendMessage(transcript);
                    }
                } catch (error) {
                    console.error("Error parsing Deepgram message:", error);
                }
            };
            
            socket.onclose = () => {
                console.log("Deepgram WebSocket closed");
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                    setIsRecording(false);
                }
            };
            
            socket.onerror = (error) => {
                console.error("Deepgram WebSocket error:", error);
                setIsRecording(false);
            };
            
            // Create cleanup function
            const cleanupRecording = () => {
                console.log("Cleaning up recording");
                if (socket && socket.readyState === WebSocket.OPEN) {
                    socket.close();
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                }
                setIsRecording(false);
            };
            
            // Store cleanup function globally for button access
            window.stopRecording = cleanupRecording;
            
            // Also clean up on component unmount
            return () => {
                cleanupRecording();
            };
        } catch (error) {
            console.error("Error accessing microphone:", error);
            alert("Error accessing microphone: " + error.message);
            setIsRecording(false);
        }
    };

    // Clean up on component unmount
    useEffect(() => {
        // we want to always have the voice interaction open. 
        startMicrophone();
    }, []);

    // Cleanup audio on component unmount
    useEffect(() => {
        return () => {
            if (currentAudio) {
                currentAudio.pause();
                setCurrentAudio(null);
                setIsSpeaking(false);
            }
        };
    }, [currentAudio]);

    return (
        <div className='agent_container'>
            {/* <AnimatePresence>
                <AuthPopup 
                    isOpen={showAuthPopup}
                />
                <ConnectAppPopup 
                    isOpen={showConnectAppPopup}
                    onClose={() => setShowConnectAppPopup(false)}
                    app={appToConnect}
                    onConnect={handleConnectApp}
                    user={user}
                    setShowAuthPopup={setShowAuthPopup}
                />
                <AppNotAvailablePopup 
                    isOpen={showAppNotAvailablePopup}
                    onClose={() => setShowAppNotAvailablePopup(false)}
                    app={appNotAvailable}
                    user={user}
                    setShowAuthPopup={setShowAuthPopup}
                />
            </AnimatePresence>

            <div className="chat_holder">

                <div className="chat_header">

                    <div className="chat_header_left">
                        {jobId ? (    
                            <div className={`nothing ${jobId ? 'share' : ''}`} onClick={handleShare}>
                                {
                                    isSharing ? (
                                        <>
                                            <FaIcons.FaCheck />
                                        Copied
                                        </>
                                    ) : (
                                        <>
                                            <FaIcons.FaLink />
                                            Share
                                            </>
                                    )
                                }
                            </div>
                        ) : (
                            // <div></div>
                            
                                <HowToUse 
                                    isOpen={showFiles}
                                    onOpen={() => {
                                        openHowToUse();
                                    }}
                                    onClose={() => {
                                        console.log("Closing files popup");
                                        console.log(showFiles);
                                        setShowFiles(false);
                                    }}
                                    trigger={
                                        <div className="reset_button share howtobutton">
                                            <p>How to Use</p>
                                        </div>
                                    }
                                    // userData={userData}
                                    // files={files}
                                    // setFiles={setFiles}
                                    onConnect={handleConnectApp}
                                />
                                
                        )} 

                        <FacingBugs 
                            isOpen={showFiles}
                            onOpen={() => {
                                openHowToUse();
                            }}
                            onClose={() => {
                                console.log("Closing files popup");
                                console.log(showFiles);
                                setShowFiles(false);
                            }}
                            trigger={
                                <div className="facing_bugs">
                                    <p>Facing a bug?</p>
                                </div>
                            }
                        />

                        //{/* <div className="error_message">
                        //    <div className="error_message_sign">
                        //        !
                        //    </div>
                        //    Unfortunately, we are currently facing issues at the moment due to unexpectedly high usage. Fixing this asap!
                        //</div> 

                    </div>
                    
                    <div className="reset_button right_holder">
                        {user && (
                            <div className="chat_header_right" style={{ display: 'flex', alignItems: 'center', gap: '2.75rem' }}>
                                <Content 
                                    isOpen={showContent}
                                    onClose={() => {
                                        console.log("Closing content popup");
                                        setShowContent(false);
                                    }}
                                    trigger={
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                            <MdArticle size={20} />
                                            <p style={{ cursor: 'pointer', fontWeight: 500 }}>Content Center</p>
                                        </div>
                                    }
                                    userData={userData}
                                    contents={contents}
                                    setContents={setContents}
                                    refreshContents={refreshContents}
                                />
                                <Files 
                                    isOpen={showFiles}
                                    onClose={() => {
                                        console.log("Closing files popup");
                                        console.log(showFiles);
                                        setShowFiles(false);
                                    }}
                                    trigger={
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                            <MdPermMedia size={20} />
                                            <p style={{ cursor: 'pointer', fontWeight: 500 }}>Media Center</p>
                                        </div>
                                    }
                                    userData={userData}
                                    files={files}
                                    setFiles={setFiles}
                                    images={images}
                                    setImages={setImages}
                                    refreshFiles={refreshFiles}
                                    imageUrls={imageUrls}
                                    setImageUrls={setImageUrls}
                                />
                                <Apps trigger={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <IoMdApps size={24} />
                                        <p style={{ cursor: 'pointer', fontWeight: 500 }}>Apps</p>
                                    </div>
                                } 
                                isOpen={showApps}
                                setIsOpen={setShowApps}
                                userData={userData}
                                connectedApps={connectedApps}
                                nonConnectedApps={nonConnectedApps}
                                setConnectedApps={setConnectedApps}
                                setNonConnectedApps={setNonConnectedApps}
                                />
                            </div>
                        )}

                        {!user && (
                            <Login />
                        )}
                    </div>
                </div>

                <div className="chat_messages" ref={messagesContainerRef}>
                    {
                        messages.length == 0 ? (
                            <div className="chat_intro_area">
                                <div className="chat_intro_area_text">
                                    <p>How will you use Saidar today?</p>
                                </div>
                                <div className="chat_intro_input_area">
                                    {(attachedDocuments.length > 0) && (
                                        <div className="intro_attachments_preview">
                                            {attachedDocuments.map((doc, index) => (
                                                <div key={`intro-doc-${index}`} className="attachment document">
                                                    <div className="document_preview">
                                                        <FaIcons.FaFileAlt size={24} />
                                                        <span>{doc.name}</span>
                                                    </div>
                                                    <button onClick={() => removeAttachedDocument(index)} className="remove_attachment">
                                                        <IoClose size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {(attachedImages.length > 0) && (
                                        <div className="intro_attachments_preview">
                                            {attachedImages.map((image, index) => (
                                                <div key={`intro-image-${index}`} className="attachment image">
                                                    <img src={image.data} alt="Image" style={{height: '50px'}} />
                                                    <button onClick={() => removeAttachedImage(index)} className="remove_attachment">
                                                        <IoClose size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    
                                    <div className="chat_intro_input">
                                        <FaIcons.FaPaperclip 
                                            onClick={openFileDialog}
                                            style={{ cursor: 'pointer', marginRight: '0.65rem', opacity: 0.65, fontWeight: 200 }}
                                        />
                                        <input 
                                            type="text" 
                                            ref={inputRef} 
                                            placeholder="Eg. Setup a meeting at 5pm on my calendar..." 
                                            value={inputMessage} 
                                            onChange={(e) => setInputMessage(e.target.value)} 
                                            onKeyPress={handleKeyPress} 
                                        />
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            style={{ display: 'none' }}
                                            onChange={handleFileUpload}
                                            multiple
                                            accept=".pdf,.docx,.doc,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
                                        />
                                        {
                                            isRecording ? (
                                                <FaIcons.FaStopCircle 
                                                    onClick={() => window.stopRecording()} 
                                                    style={{ cursor: 'pointer'}} 
                                                />
                                            ) : (
                                                <FaIcons.FaMicrophone 
                                                    onClick={startMicrophone} 
                                                    style={{ 
                                                        cursor: 'pointer',                                                      
                                                    }} 
                                                />
                                            )
                                        }
                                    </div>
                                </div>
                                <div className="chat_intro_area_examples">
                                    <p>Try one of these out!</p>
                                    <div className="examples_container" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px' }}>
                                        <div className="example_card" onClick={() => {
                                            setInputMessage("Send an application email with my resume to hiring@saidar.ai");
                                            sendMessage("Send an application email with my resume to hiring@saidar.ai");
                                        }}>
                                            <div className="category_overlay">Career</div>
                                            <p>Send an application email with my resume to hiring@saidar.ai</p>
                                        </div>
                                        <div className="example_card" onClick={() => {
                                            setInputMessage("Post \"good morning :)\" on twitter daily at 9am");
                                            sendMessage("Post \"good morning :)\" on twitter daily at 9am");
                                        }}>
                                            <div className="category_overlay">Social Media</div>
                                            <p>Post "good morning :)" on twitter daily at 9am</p>
                                        </div>
                                        <div className="example_card" onClick={() => {
                                            setInputMessage("Email me a detailed report of the US stock market today");
                                            sendMessage("Email me a detailed report of the US stock market today");
                                        }}>
                                            <div className="category_overlay">Finance</div>
                                            <p>Email me a detailed report of the US stock market today</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                            <div className="chat_messages_container">
                                {filteredMessages.map((message, index) => {
                                    if (message.role === 'user') {
                                        return (
                                            <div key={`user-${index}`} className={`chat_message sent`}>
                                                <div className="message">
                                                    <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0}}>
                                                        <Markdown>{message.content?.trim().replace(/^['"]|['"]$/g, '')}</Markdown>
                                                    </pre>
                                                    {message.documents && message.documents.length > 0 && (
                                                        <div className="documents_preview">
                                                            {message.documents.map((doc, docIndex) => (
                                                                <div key={`doc-${index}-${docIndex}`} className="attachment document">
                                                                    <div className="document_preview">
                                                                        <FaIcons.FaFileAlt size={24} />
                                                                        <span>{doc.name}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    } else if (message.role === 'decision') {
                                        return (
                                            <div key={`decision-${index}`} className={`chat_message decision`}>
                                                <div className="message">
                                                    <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0}}>
                                                        <Markdown>{message.content?.trim().replace(/^['"]|['"]$/g, '')}</Markdown>
                                                    </pre>
                                                </div>
                                            </div>
                                        );
                                    } else if (message.role === 'action') {
                                        return (
                                            <div key={`action-${index}`} className={`chat_message action`}>
                                                <div className="message action_message">
                                                    <p className="action_header">Taking action...</p>
                                                    <p className="action_content">{message.content}</p>
                                                    <p className="action_app"><span style={{opacity: 0.75}}>using</span> <span style={{fontWeight: 'bold', opacity: 1}}>{formatAppName(message.app)}</span></p>
                                                </div>
                                            </div>
                                        );
                                    } else if (message.role === 'assistant') {
                                        return (
                                            <div key={`assistant-${index}`} className={`chat_message received`}>
                                                <div className="message">
                                                    <pre style={{whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0}}>
                                                        <Markdown>{
                                                            (() => {
                                                                const content = message.content?.trim().replace(/^['"]|['"]$/g, '');
                                                                const imageStart = content.indexOf("<image>");
                                                                if (imageStart === -1) {
                                                                    return content;
                                                                }
                                                                const imageEnd = content.indexOf("</image>");
                                                                if (imageEnd === -1) {
                                                                    return content;
                                                                }
                                                                return content.substring(0, imageStart) + content.substring(imageEnd + "</image>".length);
                                                            })()
                                                        }</Markdown>
                                                    </pre>
                                                    <div className="image_preview_container">
                                                        {messageImages.filter(image => image.message_index === index).map((image, imageIndex) => (
                                                            <div key={`image-${imageIndex}`} className="image_preview">
                                                                <img src={image.url} alt="Image" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    } else if (message.role === 'complete') {
                                        return (
                                            messages[index - 1]?.role === 'user' ? (
                                                <div key={`complete-${index}`} className={`chat_message received complete`}>
                                                    Saidar chose not to reply.
                                                </div>
                                            ) : null
                                        );
                                    } else if (message.type === 'mass_content_generation') {
                                        return ( 
                                        <div className="mass_content_container">
                                            <div className="mass_content_header">
                                                <div className="mass_content_text">
                                                    <div className="mass_content_title">Saidar is writing...</div>
                                                    <div className="mass_content_progress_text">{message.count}/{message.total}</div>
                                                </div>
                                            </div>
                                            
                                            <div className="mass_content_progress_container">
                                                <div className="mass_content_progress_bar">
                                                    <div 
                                                        className="mass_content_progress_fill"
                                                        style={{ width: `${(message.count / message.total) * 100}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                            
                                            <div className="mass_content_current_title">
                                                <div className="mass_content_title_icon">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
                                                    </svg>
                                                </div>
                                                <span className="mass_content_title_text">{message.latest_title}</span>
                                            </div>
                                        </div>  
                                        );
                                    } else if (message.type === 'research') {
                                        return ( 
                                        <div className="mass_content_container">
                                            <div className="mass_content_header">
                                                <div className="mass_content_text">
                                                    <div className="mass_content_title">Saidar is researching...</div>
                                                    <div className="mass_content_progress_text" style={{opacity: 0.5}}>Takes ~2 minutes</div>
                                                </div>
                                            </div>
                                            <div className="mass_content_progress_container">
                                                <div className="mass_content_progress_bar">
                                                    <div 
                                                        className="mass_content_progress_fill"
                                                        style={{ width: `${
                                                            message.latest_title === "Planning" ? 0 :
                                                            message.latest_title === "Searching" ? 15 + ((message.count / (message.total || 7)) * 85) :
                                                            50 + ((message.count / (message.total || 7)) * 50)
                                                        }%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                            
                                            <div className="mass_content_current_title">
                                                <div className="mass_content_title_icon">
                                                    {
                                                        (message.latest_title === "Searching" || message.latest_title === "Planning") ? (
                                                            <FaIcons.FaSearch size={14} style={{color: '#000', opacity: 0.5}} />
                                                        ) : (
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
                                                            </svg>
                                                        )
                                                    }
                                                </div>
                                                <span className="mass_content_title_text">{message.latest_title}</span>
                                            </div>
                                        </div>  
                                        );
                                    }
                                    return null;
                                })}
                                {messages[messages.length - 1]?.role === 'user' && (
                                    isProcessing ? (
                                        <div key="thinking" className={`chat_message received thinking`}>
                                            <div className="spinner" style={{
                                                display: 'inline-block',
                                                animation: 'spin 1s linear infinite'
                                            }}>
                                                <div style={{
                                                    width: '12px',
                                                    height: '12px',
                                                    border: '2px solid #fff',
                                                    borderTop: '2px solid transparent',
                                                    borderRadius: '50%'
                                                }}/>
                                            </div>
                                            <style>{`
                                                @keyframes spin {
                                                    0% { transform: rotate(0deg); }
                                                    100% { transform: rotate(360deg); }
                                                }
                                            `}</style>
                                            Processing documents...
                                        </div>
                                    ) : (
                                        <div key="thinking" className={`chat_message received thinking`}>
                                            Thinking...
                                        </div>

                                    )
                                )}
                            </div>

                            <div className="chat_input_holder">
                                {(attachedDocuments.length > 0) && (
                                    <div className="attachments_preview">
                                        {attachedDocuments.map((doc, index) => (
                                            <div key={`preview-doc-${index}`} className="attachment document">
                                                <div className="document_preview">
                                                    <FaIcons.FaFileAlt size={24} />
                                                    <span>{doc.name}</span>
                                                </div>
                                                <button onClick={() => removeAttachedDocument(index)} className="remove_attachment">
                                                    <IoClose size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <div className="chat_input">
                                    <FaIcons.FaPaperclip 
                                        onClick={openFileDialog}
                                        style={{ cursor: 'pointer', marginRight: '0.1rem', opacity: 0.65, fontWeight: 200 }}
                                    />
                                    <input
                                        type="text"
                                        ref={inputRef}
                                        className="chat_input_field"
                                        placeholder="Talk to your assistant!"
                                        value={inputMessage}
                                        onChange={(e) => setInputMessage(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                    />
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        onChange={handleFileUpload}
                                        multiple
                                        accept=".pdf,.docx,.doc,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
                                    />
                                    {
                                        isRecording ? (
                                            <FaIcons.FaStopCircle 
                                                onClick={() => window.stopRecording()} 
                                                style={{ cursor: 'pointer'}} 
                                            />
                                        ) : (
                                            <FaIcons.FaMicrophone 
                                                onClick={startMicrophone} 
                                                style={{ 
                                                    cursor: 'pointer',                                                      
                                                }} 
                                            />
                                        )
                                    }
                                </div>
                            </div>

                            </>
                        )
                    }

                    {
                        agentDidntReply && (
                            <div className="agent_didnt_reply">
                                Saidar chose to not reply :(
                            </div>
                        )
                    }
                </div>

                
            </div> 
            */}


            <div className="voice_container">
                <div className="voice_interface">
                    {/* <div className="voice_status">
                        {isSpeaking && (
                            <div className="audio_controls">
                                <div className="audio_indicator">
                                    <FaIcons.FaVolumeUp />
                                    <span>Playing assistant response...</span>
                                </div>
                                <button onClick={stopAudio} className="stop_audio_btn">
                                    <FaIcons.FaStop />
                                    Stop
                                </button>
                            </div>
                        )}
                    </div> */}
                    
                    <div className="voice_avatar" style={{
                        width: '300px',
                        height: '300px',
                        backgroundColor: isSpeaking ? '#4CAF50' : 'black',
                        borderRadius: '50%',
                        margin: '100px auto',
                        transition: 'background-color 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {/* {isRecording ? (
                            <FaIcons.FaMicrophone size={60} color="white" />
                        ) : isSpeaking ? (
                            <FaIcons.FaVolumeUp size={60} color="white" />
                        ) : (
                            <FaIcons.FaCommentDots size={60} color="white" />
                        )} */}
                    </div>
{/*                     
                    <div className="voice_controls" style={{
                        textAlign: 'center',
                        marginTop: '20px'
                    }}>
                        {isRecording ? (
                            <button 
                                onClick={() => window.stopRecording()} 
                                style={{ 
                                    background: 'red',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50px',
                                    padding: '15px 30px',
                                    fontSize: '16px',
                                    cursor: 'pointer'
                                }}
                            >
                                <FaIcons.FaStopCircle style={{ marginRight: '10px' }} />
                                Stop Recording
                            </button>
                        ) : (
                            <button 
                                onClick={startMicrophone} 
                                style={{ 
                                    background: '#4CAF50',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '50px',
                                    padding: '15px 30px',
                                    fontSize: '16px',
                                    cursor: 'pointer'
                                }}
                            >
                                <FaIcons.FaMicrophone style={{ marginRight: '10px' }} />
                                Start Voice Chat
                            </button>
                        )}
                    </div> */}
                    
                    {/* {messages.length > 0 && (
                        <div className="voice_messages" style={{
                            maxWidth: '600px',
                            margin: '20px auto',
                            padding: '20px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '10px',
                            maxHeight: '300px',
                            overflowY: 'auto'
                        }}>
                            {messages.slice(-3).map((message, index) => (
                                <div key={index} style={{
                                    marginBottom: '10px',
                                    padding: '10px',
                                    backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f1f8e9',
                                    borderRadius: '8px'
                                }}>
                                    <strong>{message.role === 'user' ? 'You' : 'Assistant'}:</strong>
                                    <p>{message.content}</p>
                                </div>
                            ))}
                        </div>
                    )} */}
                </div>
            </div>

        </div> 
    );
};


export const VoiceInteraction = () => {

    //  im keeping it in here since it'll be easier to clean up the other unnecessary code this way. maybe. 
    // might be simpler development to leave the code dirtier in the other class tho.

    return (
        <div className="voice_interaction">
            <div className="voice_interaction_container">
                
            </div>
        </div>
    );
};