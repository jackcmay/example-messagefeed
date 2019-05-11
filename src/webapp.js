import AppBar from '@material-ui/core/AppBar';
import CircularProgress from '@material-ui/core/CircularProgress';
import Grid from '@material-ui/core/Grid';
import IdleTimer from 'react-idle-timer';
import InputBase from '@material-ui/core/InputBase';
import Paper from '@material-ui/core/Paper';
import PauseIcon from '@material-ui/icons/Pause';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import Snackbar from '@material-ui/core/Snackbar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import escapeHtml from 'escape-html';
import {Connection} from '@solana/web3.js';
import {fade} from '@material-ui/core/styles/colorManipulator';
import {withStyles} from '@material-ui/core/styles';

import {sleep} from './util/sleep';
import {getFirstMessage, refreshMessageFeed, postMessage} from './message-feed';

const styles = theme => ({
  root: {
    width: '100%',
  },
  grow: {
    flexGrow: 1,
  },
  menuButton: {
    marginLeft: -12,
    marginRight: 20,
  },
  title: {
    display: 'none',
    [theme.breakpoints.up('sm')]: {
      display: 'block',
    },
  },

  message: {
    ...theme.mixins.gutters(),
    paddingTop: theme.spacing.unit * 2,
    paddingBottom: theme.spacing.unit * 2,
  },

  newmessage: {
    position: 'relative',
    borderRadius: theme.shape.borderRadius,
    backgroundColor: fade(theme.palette.common.white, 0.15),
    '&:hover': {
      backgroundColor: fade(theme.palette.common.white, 0.25),
    },
    marginRight: theme.spacing.unit * 2,
    marginLeft: 0,
    width: '100%',
    [theme.breakpoints.up('sm')]: {
      marginLeft: theme.spacing.unit * 3,
      width: '60%',
    },
  },
  inputRoot: {
    color: 'inherit',
    width: '100%',
  },
  inputInput: {
    paddingTop: theme.spacing.unit,
    paddingRight: theme.spacing.unit,
    paddingBottom: theme.spacing.unit,
    paddingLeft: theme.spacing.unit * 2,
    transition: theme.transitions.create('width'),
    width: '100%',
    [theme.breakpoints.up('md')]: {
      width: 200,
    },
  },
});

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      busy: true,
      idle: false,
      messages: [],
      newMessage: '',
      snackMessage: '',
    };
    this.load();
  }

  async load() {
    let configUrl = window.location.origin;
    if (window.location.hostname === 'localhost') {
      configUrl = 'http://localhost:8081';
    }
    configUrl += '/config.json';

    for (;;) {
      try {
        const {firstMessage, url} = await getFirstMessage(configUrl);

        console.log('Cluster RPC URL:', url);
        this.connection = new Connection(url);

        this.setState({busy: false});
        this.periodicRefresh(firstMessage);
        return;
      } catch (err) {
        console.error(`Failed to load: ${err}`);
        await sleep(1000);
      }
    }
  }

  periodicRefresh = async firstMessage => {
    if (!this.state.busy) {
      this.setState({busy: true});
      try {
        const {messages} = this.state;
        await refreshMessageFeed(this.connection, messages, firstMessage);
        this.setState({messages});
      } catch (err) {
        console.error(`periodicRefresh error: ${err}`);
      }
      this.setState({busy: false});
    }
    if (!this.state.idle) {
      setTimeout(this.periodicRefresh, 1000);
    }
  };

  render() {
    const {classes} = this.props;

    const messages = this.state.messages
      .map((message, i) => {
        return (
          <div key={i}>
            <br />
            <Paper className={classes.message}>
              <Typography>{escapeHtml(message.text)}</Typography>
            </Paper>
          </div>
        );
      })
      .reverse();

    return (
      <div className={classes.root}>
        <AppBar position="static">
          <Toolbar>
            <Typography
              className={classes.title}
              variant="h6"
              color="inherit"
              noWrap
            >
              Message Feed
            </Typography>
            <div className={classes.newmessage}>
              <InputBase
                placeholder="Say something nice…"
                value={this.state.newMessage}
                classes={{
                  root: classes.inputRoot,
                  input: classes.inputInput,
                }}
                onKeyDown={this.onInputKeyDown}
                onChange={this.onInputChange}
              />
            </div>
            <div className={classes.grow} />
            {this.state.idle ? <PauseIcon /> : ''}
            {this.state.busy && !this.state.idle ? (
              <CircularProgress className={classes.progress} color="inherit" />
            ) : (
              ''
            )}
          </Toolbar>
        </AppBar>
        <IdleTimer
          element={document}
          onActive={this.onActive}
          onIdle={this.onIdle}
          debounce={250}
          timeout={1000 * 60 * 15}
        />
        <Grid item xs>
          {messages}
        </Grid>
        <Snackbar
          open={this.state.snackMessage !== ''}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          autoHideDuration={4000}
          onClose={this.onSnackClose}
          ContentProps={{
            'aria-describedby': 'message-id',
          }}
          message={<span id="message-id">{this.state.snackMessage}</span>}
        />
      </div>
    );
  }

  async postMessage() {
    if (this.state.newMessage.length === 0) {
      return;
    }

    this.setState({busy: true});
    const {messages, newMessage} = this.state;
    try {
      await postMessage(
        this.connection,
        newMessage,
        messages[messages.length - 1].publicKey,
      );
      await refreshMessageFeed(this.connection, messages);
      this.setState({
        busy: false,
        snackMessage: 'Message posted',
        newMessage: '',
      });
    } catch (err) {
      console.error(`Failed to post message: ${err}`);
      this.setState({
        busy: false,
        snackMessage: 'An error occured when posting the message',
      });
    }
  }

  onInputKeyDown = e => {
    if (e.keyCode !== 13) {
      return;
    }

    if (this.state.busy) {
      this.setState({
        snackMessage: 'Unable to post message, please retry when not busy',
      });
    } else {
      this.postMessage();
    }
  };

  onInputChange = e => {
    this.setState({newMessage: e.target.value});
  };

  onSnackClose = () => {
    this.setState({snackMessage: ''});
  };

  onActive = () => {
    console.log('user is active');
    this.setState({idle: false});
    this.periodicRefresh();
  };

  onIdle = () => {
    console.log('user is idle');
    this.setState({idle: true});
  };
}
App.propTypes = {
  classes: PropTypes.object.isRequired,
};

const StyledApp = withStyles(styles)(App);
ReactDOM.render(<StyledApp />, document.getElementById('app'));
module.hot.accept();
